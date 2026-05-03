/**
 * CUENTAX — DTE Mailbox Polling Job (BullMQ)
 *
 * Cada N minutos, para cada empresa con `dte_imap_auto_sync=true`:
 *  1. Conecta al IMAP (host/user/password encriptado en companies)
 *  2. Busca emails NO leídos en INBOX
 *  3. Por cada attachment .xml o .zip, intenta parsearlo como EnvioDTE
 *  4. Persiste DTEs entrantes en `dtes_recibidos` con fuente='imap'
 *  5. Marca el email como leído
 */

import type { Job, Queue, Worker } from 'bullmq'
import { eq, and } from 'drizzle-orm'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { db } from '@/db/client'
import { companies, dtesRecibidos } from '@/db/schema'
import { decrypt } from '@/core/crypto'
import { siiBridgeAdapter } from '@/adapters/sii-bridge.adapter'
import { logger } from '@/core/logger'
import { createQueue, createWorker } from '@/core/queue'

const QUEUE_NAME = 'dte-mailbox-polling'
const POLL_EVERY_MS = 15 * 60 * 1000 // 15 minutes

let queue: Queue | null = null
let worker: Worker | null = null

interface IncomingDTE {
  tipo_dte: number
  folio: number
  rut_emisor: string
  rut_receptor: string
  razon_social_emisor?: string
  fecha_emision: string
  monto_total: number
}

async function processCompanyMailbox(company: typeof companies.$inferSelect): Promise<{ ingested: number; errors: number }> {
  let ingested = 0
  let errors = 0

  if (!company.dte_imap_host || !company.dte_imap_user || !company.dte_imap_password_enc) {
    return { ingested, errors }
  }

  let password: string
  try {
    password = decrypt(company.dte_imap_password_enc)
  } catch (err) {
    logger.warn({ companyId: company.id, err }, 'IMAP password decrypt failed')
    return { ingested, errors: 1 }
  }

  const client = new ImapFlow({
    host: company.dte_imap_host,
    port: company.dte_imap_port ?? 993,
    secure: true,
    auth: { user: company.dte_imap_user, pass: password },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      // Search unseen messages
      const uids = await client.search({ seen: false }, { uid: true })
      if (!uids || uids.length === 0) {
        logger.debug({ companyId: company.id, rut: company.rut }, 'No unread emails in DTE inbox')
        return { ingested, errors }
      }

      logger.info({ companyId: company.id, rut: company.rut, count: uids.length }, 'Processing unread DTE emails')

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true })
          if (!msg || !msg.source) continue
          const parsed = await simpleParser(msg.source)
          const attachments = (parsed.attachments ?? []).filter(a =>
            (a.contentType || '').toLowerCase().includes('xml')
            || (a.filename || '').toLowerCase().endsWith('.xml')
          )
          if (attachments.length === 0) continue

          for (const att of attachments) {
            const xmlContent = att.content as Buffer
            try {
              const parsedEnvio = await siiBridgeAdapter.receptionParse(
                xmlContent, att.filename || 'envio.xml',
              )
              if (!parsedEnvio?.success || !Array.isArray(parsedEnvio.dtes)) continue

              const xmlB64 = xmlContent.toString('base64')
              const rutReceptor = (company.rut || '').replace(/\./g, '').replace(/-/g, '').toUpperCase()

              for (const d of parsedEnvio.dtes as IncomingDTE[]) {
                const dteRutRecep = (d.rut_receptor || '').replace(/\./g, '').replace(/-/g, '').toUpperCase()
                if (dteRutRecep !== rutReceptor) continue
                try {
                  await db.insert(dtesRecibidos).values({
                    company_id: company.id,
                    tipo_dte: d.tipo_dte,
                    folio: d.folio,
                    rut_emisor: d.rut_emisor,
                    razon_social_emisor: d.razon_social_emisor ?? null,
                    fecha_emision: d.fecha_emision,
                    monto_total: d.monto_total ?? 0,
                    envio_xml_b64: xmlB64,
                    fuente: 'imap',
                    email_origen: parsed.from?.text ?? null,
                  }).onConflictDoNothing()
                  ingested++
                } catch (err) {
                  logger.warn({ companyId: company.id, folio: d.folio, err }, 'insert dte_recibido (imap) failed')
                  errors++
                }
              }
            } catch (err) {
              logger.warn({ companyId: company.id, filename: att.filename, err }, 'Could not parse XML attachment')
              errors++
            }
          }

          // Mark as seen so we don't reprocess
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
        } catch (err) {
          logger.warn({ companyId: company.id, uid, err }, 'Error processing email')
          errors++
        }
      }
    } finally {
      lock.release()
    }
  } catch (err) {
    logger.error({ companyId: company.id, host: company.dte_imap_host, err }, 'IMAP connection failed')
    errors++
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }

  // Update last_sync timestamp
  try {
    await db.update(companies)
      .set({ dte_imap_last_sync: new Date() })
      .where(eq(companies.id, company.id))
  } catch { /* ignore */ }

  return { ingested, errors }
}

async function processMailboxPoll(job: Job): Promise<void> {
  logger.debug({ jobId: job.id }, 'Executing DTE mailbox poll')

  // Fetch companies with auto sync enabled and credentials configured
  const targetCompanies = await db.select().from(companies)
    .where(and(
      eq(companies.dte_imap_auto_sync, true),
      eq(companies.activo, true),
    ))

  const enabled = targetCompanies.filter(c => c.dte_imap_host && c.dte_imap_user && c.dte_imap_password_enc)
  if (enabled.length === 0) {
    logger.debug('No companies with IMAP DTE auto-sync enabled')
    return
  }

  logger.info({ count: enabled.length }, `Polling DTE mailbox for ${enabled.length} companies`)

  let totalIngested = 0
  let totalErrors = 0
  for (const c of enabled) {
    const { ingested, errors } = await processCompanyMailbox(c)
    totalIngested += ingested
    totalErrors += errors
  }

  if (totalIngested > 0 || totalErrors > 0) {
    logger.info({ totalIngested, totalErrors }, 'DTE mailbox poll completed')
  }
}

export async function startDTEMailboxPoller(): Promise<void> {
  queue = createQueue(QUEUE_NAME)
  worker = createWorker(QUEUE_NAME, processMailboxPoll)

  await queue.upsertJobScheduler(
    'dte-mailbox-repeat',
    { every: POLL_EVERY_MS },
    {
      name: 'poll-dte-mailbox',
      opts: {
        attempts: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    },
  )

  logger.info(`DTE Mailbox Poller started (BullMQ, every ${POLL_EVERY_MS / 1000}s)`)
}

export async function stopDTEMailboxPoller(): Promise<void> {
  if (worker) { await worker.close(); worker = null }
  if (queue) { await queue.close(); queue = null }
  logger.info('DTE Mailbox Poller stopped')
}

export function getDTEMailboxQueue(): Queue | null {
  return queue
}

/** Manual trigger for one company (used by /api/v1/dte-recibidos/sync-now). */
export async function pollMailboxForCompany(companyId: number): Promise<{ ingested: number; errors: number }> {
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!c) return { ingested: 0, errors: 0 }
  return processCompanyMailbox(c)
}
