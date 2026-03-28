/**
 * CUENTAX — Contacts Repository (Drizzle ORM)
 */
import { eq, and, or, ilike, desc } from 'drizzle-orm'
import { db } from '@/db/client'
import { contacts } from '@/db/schema'

type InsertContact = typeof contacts.$inferInsert
type Contact = typeof contacts.$inferSelect

class ContactsRepository {
  async findMany(companyId: number, opts: {
    search?: string
    es_cliente?: boolean
    es_proveedor?: boolean
    page?: number
    limit?: number
  } = {}): Promise<{ data: Contact[], total: number }> {
    const limit  = Math.min(opts.limit ?? 50, 200)
    const offset = ((opts.page ?? 1) - 1) * limit

    const conditions = [
      eq(contacts.company_id, companyId),
      eq(contacts.activo, true),
    ] as any[]

    if (opts.search) {
      conditions.push(
        or(
          ilike(contacts.razon_social, `%${opts.search}%`),
          ilike(contacts.rut, `%${opts.search}%`),
        )
      )
    }
    if (opts.es_cliente   !== undefined) conditions.push(eq(contacts.es_cliente,  opts.es_cliente))
    if (opts.es_proveedor !== undefined) conditions.push(eq(contacts.es_proveedor, opts.es_proveedor))

    const where = and(...conditions)

    const [data, countResult] = await Promise.all([
      db.select().from(contacts).where(where).orderBy(desc(contacts.created_at)).limit(limit).offset(offset),
      db.select().from(contacts).where(where),
    ])

    return { data, total: countResult.length }
  }

  async findById(id: number, companyId: number): Promise<Contact | null> {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.company_id, companyId), eq(contacts.activo, true)))
      .limit(1)
    return contact ?? null
  }

  async findByRut(companyId: number, rut: string): Promise<Contact | null> {
    const [c] = await db.select().from(contacts)
      .where(and(eq(contacts.company_id, companyId), eq(contacts.rut, rut)))
      .limit(1)
    return c ?? null
  }

  async create(data: InsertContact): Promise<Contact> {
    const [c] = await db.insert(contacts).values(data).returning()
    return c
  }

  async update(id: number, companyId: number, data: Partial<InsertContact>): Promise<Contact | null> {
    const [c] = await db.update(contacts)
      .set(data)
      .where(and(eq(contacts.id, id), eq(contacts.company_id, companyId)))
      .returning()
    return c ?? null
  }

  async softDelete(id: number, companyId: number): Promise<void> {
    await db.update(contacts)
      .set({ activo: false })
      .where(and(eq(contacts.id, id), eq(contacts.company_id, companyId)))
  }
}

export const contactsRepository = new ContactsRepository()
