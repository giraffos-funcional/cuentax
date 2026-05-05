/**
 * Activity log del tenant — feed combinado de audit_log y notifications.
 * Read-only, ordenado por fecha desc.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { db } from '@/db/client'

interface ActivityRow {
  source: 'audit' | 'notification'
  id: number
  level: string
  title: string
  body: string | null
  href: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

export async function activityRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'validation_error' })

    const tenantId = request.tenantId
    const result = await db.execute(sql`
      (SELECT
         'notification' AS source, id, level,
         title,
         body,
         href,
         created_at,
         metadata
       FROM notifications
       WHERE tenant_id = ${tenantId} AND archived_at IS NULL
       ORDER BY created_at DESC
       LIMIT ${q.data.limit})
      UNION ALL
      (SELECT
         'audit' AS source, id, 'info' AS level,
         action AS title,
         (CASE WHEN resource IS NOT NULL THEN resource || '#' || COALESCE(resource_id::text, '?') ELSE NULL END) AS body,
         NULL AS href,
         created_at,
         payload_json AS metadata
       FROM audit_log
       WHERE tenant_id = ${tenantId}
       ORDER BY created_at DESC
       LIMIT ${q.data.limit})
      ORDER BY created_at DESC
      LIMIT ${q.data.limit}
    `)
    const rows = ((result as any).rows ?? result) as ActivityRow[]
    return reply.send({ data: rows })
  })
}
