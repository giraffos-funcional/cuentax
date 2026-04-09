/**
 * CUENTAX — Bank Routes (Cuentas Bancarias & Transacciones)
 * ===========================================================
 * CRUD for bank accounts, transactions, and reconciliation.
 *
 * Accounts:
 *   GET    /accounts                   — List active bank accounts
 *   POST   /accounts                   — Create bank account
 *   PUT    /accounts/:id               — Update account name/type
 *   PUT    /accounts/:id/credentials   — Save bank credentials (encrypted)
 *   GET    /accounts/:id/credentials   — Get credential status (no password)
 *   DELETE /accounts/:id               — Soft delete (activo=false)
 *
 * Transactions:
 *   GET    /accounts/:id/transactions  — List with filters + pagination
 *   POST   /accounts/:id/transactions  — Add manual transaction
 *   DELETE /transactions/:txId         — Delete a transaction
 *
 * Reconciliation:
 *   POST   /accounts/:id/reconcile     — Link transaction to DTE
 *   POST   /accounts/:id/unreconcile   — Remove DTE link
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, gte, lte, count, sql } from 'drizzle-orm'
import { authGuard } from '@/middlewares/auth-guard'
import { db } from '@/db/client'
import { bankAccounts, bankTransactions } from '@/db/schema'
import { encrypt, decrypt } from '@/core/crypto'
import { logger } from '@/core/logger'
import { getLocalCompanyId } from '@/core/company-resolver'

// ── Validation Schemas ─────────────────────────────────────────

const createAccountSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  banco: z.string().min(1, 'Banco requerido'),
  tipo_cuenta: z.enum(['corriente', 'vista', 'ahorro', 'rut']).default('corriente'),
  numero_cuenta: z.string().min(1, 'Numero de cuenta requerido'),
})

const updateAccountSchema = z.object({
  nombre: z.string().min(1).optional(),
  tipo_cuenta: z.enum(['corriente', 'vista', 'ahorro', 'rut']).optional(),
})

const credentialsSchema = z.object({
  bank_user: z.string().min(1, 'Usuario requerido'),
  bank_password: z.string().min(1, 'Clave requerida'),
  scraping_enabled: z.boolean().optional().default(false),
})

const createTransactionSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  descripcion: z.string().min(1, 'Descripcion requerida'),
  monto: z.number().int().refine(v => v !== 0, 'Monto no puede ser 0'),
  tipo: z.enum(['debito', 'credito']),
  referencia: z.string().optional(),
})

const reconcileSchema = z.object({
  tx_id: z.number().int().positive(),
  dte_document_id: z.number().int().positive(),
  note: z.string().optional(),
})

const unreconcileSchema = z.object({
  tx_id: z.number().int().positive(),
})

// ── Routes ─────────────────────────────────────────────────────

export async function bankRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── GET /accounts — List active bank accounts ────────────────
  fastify.get('/accounts', async (req, reply) => {
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)

    if (!companyId) {
      return reply.status(404).send({ error: 'Company not found' })
    }

    const data = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.company_id, companyId), eq(bankAccounts.activo, true)))
      .orderBy(desc(bankAccounts.created_at))

    return reply.send({ data })
  })

  // ── POST /accounts — Create bank account ─────────────────────
  fastify.post('/accounts', async (req, reply) => {
    const parse = createAccountSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    }

    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)

    if (!companyId) {
      return reply.status(404).send({ error: 'Company not found' })
    }

    const data = parse.data

    const [created] = await db.insert(bankAccounts).values({
      company_id: companyId,
      nombre: data.nombre,
      banco: data.banco,
      tipo_cuenta: data.tipo_cuenta,
      numero_cuenta: data.numero_cuenta,
    }).returning()

    logger.info({ accountId: created.id, companyId }, 'Bank account created')
    return reply.status(201).send(created)
  })

  // ── PUT /accounts/:id — Update account name/type ─────────────
  fastify.put('/accounts/:id', async (req, reply) => {
    const parse = updateAccountSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    }

    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, Number(id)), eq(bankAccounts.company_id, companyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })

    const updateValues: Record<string, unknown> = { updated_at: new Date() }
    if (parse.data.nombre !== undefined) updateValues.nombre = parse.data.nombre
    if (parse.data.tipo_cuenta !== undefined) updateValues.tipo_cuenta = parse.data.tipo_cuenta

    const [updated] = await db
      .update(bankAccounts)
      .set(updateValues)
      .where(eq(bankAccounts.id, Number(id)))
      .returning()

    return reply.send(updated)
  })

  // ── PUT /accounts/:id/credentials — Save bank credentials ────
  fastify.put('/accounts/:id/credentials', async (req, reply) => {
    const parse = credentialsSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    }

    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, Number(id)), eq(bankAccounts.company_id, companyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })

    const encryptedPassword = encrypt(parse.data.bank_password)

    await db
      .update(bankAccounts)
      .set({
        bank_user: parse.data.bank_user,
        bank_password_enc: encryptedPassword,
        scraping_enabled: parse.data.scraping_enabled,
        updated_at: new Date(),
      })
      .where(eq(bankAccounts.id, Number(id)))

    logger.info({ accountId: Number(id), companyId }, 'Bank credentials updated')
    return reply.send({ message: 'Credenciales guardadas correctamente' })
  })

  // ── GET /accounts/:id/credentials — Credential status ────────
  fastify.get('/accounts/:id/credentials', async (req, reply) => {
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [account] = await db
      .select({
        bank_user: bankAccounts.bank_user,
        has_password: bankAccounts.bank_password_enc,
        scraping_enabled: bankAccounts.scraping_enabled,
      })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, Number(id)), eq(bankAccounts.company_id, companyId)))

    if (!account) return reply.status(404).send({ error: 'not_found' })

    return reply.send({
      bank_user: account.bank_user ?? null,
      has_password: !!account.has_password,
      scraping_enabled: account.scraping_enabled ?? false,
    })
  })

  // ── DELETE /accounts/:id — Soft delete ───────────────────────
  fastify.delete('/accounts/:id', async (req, reply) => {
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, Number(id)), eq(bankAccounts.company_id, companyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })

    await db
      .update(bankAccounts)
      .set({ activo: false, updated_at: new Date() })
      .where(eq(bankAccounts.id, Number(id)))

    logger.info({ accountId: Number(id), companyId }, 'Bank account soft-deleted')
    return reply.status(204).send()
  })

  // ── GET /accounts/:id/transactions — List transactions ───────
  fastify.get('/accounts/:id/transactions', async (req, reply) => {
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }
    const query = req.query as {
      fecha_desde?: string
      fecha_hasta?: string
      reconcile_status?: string
      page?: string
      limit?: string
    }

    // Verify account ownership
    const [account] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, Number(id)), eq(bankAccounts.company_id, companyId)))

    if (!account) return reply.status(404).send({ error: 'not_found' })

    const page = query.page ? Number(query.page) : 1
    const limit = query.limit ? Math.min(Number(query.limit), 100) : 50
    const offset = (page - 1) * limit

    const conditions = [eq(bankTransactions.bank_account_id, Number(id))]
    if (query.fecha_desde) conditions.push(gte(bankTransactions.fecha, query.fecha_desde))
    if (query.fecha_hasta) conditions.push(lte(bankTransactions.fecha, query.fecha_hasta))
    if (query.reconcile_status && query.reconcile_status !== 'todas') {
      conditions.push(eq(bankTransactions.reconcile_status, query.reconcile_status as any))
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)

    const [data, [totalResult]] = await Promise.all([
      db
        .select()
        .from(bankTransactions)
        .where(whereClause)
        .orderBy(desc(bankTransactions.fecha), desc(bankTransactions.id))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(bankTransactions)
        .where(whereClause),
    ])

    return reply.send({
      data,
      total: totalResult?.count ?? 0,
      saldo: account.saldo ?? 0,
      page,
      limit,
    })
  })

  // ── POST /accounts/:id/transactions — Add manual transaction ─
  fastify.post('/accounts/:id/transactions', async (req, reply) => {
    const parse = createTransactionSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    }

    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    // Verify account ownership
    const [account] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, Number(id)), eq(bankAccounts.company_id, companyId)))

    if (!account) return reply.status(404).send({ error: 'not_found' })

    const data = parse.data

    const [created] = await db.insert(bankTransactions).values({
      bank_account_id: Number(id),
      company_id: companyId,
      fecha: data.fecha,
      descripcion: data.descripcion,
      monto: data.monto,
      tipo: data.tipo,
      referencia: data.referencia ?? null,
      source: 'manual',
    }).returning()

    logger.info({ txId: created.id, accountId: Number(id), companyId }, 'Manual bank transaction created')
    return reply.status(201).send(created)
  })

  // ── DELETE /transactions/:txId — Delete a transaction ────────
  fastify.delete('/transactions/:txId', async (req, reply) => {
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)
    const { txId } = req.params as { txId: string }

    const [existing] = await db
      .select()
      .from(bankTransactions)
      .where(and(eq(bankTransactions.id, Number(txId)), eq(bankTransactions.company_id, companyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })

    await db.delete(bankTransactions).where(eq(bankTransactions.id, Number(txId)))

    logger.info({ txId: Number(txId), companyId }, 'Bank transaction deleted')
    return reply.status(204).send()
  })

  // ── POST /accounts/:id/reconcile — Link transaction to DTE ──
  fastify.post('/accounts/:id/reconcile', async (req, reply) => {
    const parse = reconcileSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    }

    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    // Verify account ownership
    const [account] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, Number(id)), eq(bankAccounts.company_id, companyId)))

    if (!account) return reply.status(404).send({ error: 'not_found' })

    // Verify transaction belongs to this account
    const [tx] = await db
      .select()
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.id, parse.data.tx_id),
        eq(bankTransactions.bank_account_id, Number(id)),
      ))

    if (!tx) return reply.status(404).send({ error: 'Transaction not found' })

    const [updated] = await db
      .update(bankTransactions)
      .set({
        reconcile_status: 'conciliado',
        dte_document_id: parse.data.dte_document_id,
        reconcile_note: parse.data.note ?? null,
        reconciled_at: new Date(),
      })
      .where(eq(bankTransactions.id, parse.data.tx_id))
      .returning()

    logger.info({ txId: parse.data.tx_id, dteId: parse.data.dte_document_id }, 'Bank transaction reconciled')
    return reply.send({ success: true, transaction: updated })
  })

  // ── POST /accounts/:id/unreconcile — Remove DTE link ────────
  fastify.post('/accounts/:id/unreconcile', async (req, reply) => {
    const parse = unreconcileSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    }

    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    // Verify account ownership
    const [account] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, Number(id)), eq(bankAccounts.company_id, companyId)))

    if (!account) return reply.status(404).send({ error: 'not_found' })

    const [tx] = await db
      .select()
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.id, parse.data.tx_id),
        eq(bankTransactions.bank_account_id, Number(id)),
      ))

    if (!tx) return reply.status(404).send({ error: 'Transaction not found' })

    const [updated] = await db
      .update(bankTransactions)
      .set({
        reconcile_status: 'sin_conciliar',
        dte_document_id: null,
        reconcile_note: null,
        reconciled_at: null,
      })
      .where(eq(bankTransactions.id, parse.data.tx_id))
      .returning()

    logger.info({ txId: parse.data.tx_id }, 'Bank transaction unreconciled')
    return reply.send({ success: true, transaction: updated })
  })
}
