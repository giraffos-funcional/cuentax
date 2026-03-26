/**
 * CUENTAX — Odoo Auth Adapter
 * ============================
 * Comunica con Odoo 18 vía JSON-RPC para autenticación.
 * Retorna uid del usuario autenticado o null si falla.
 */

import axios from 'axios'
import { config } from '@/core/config'
import { logger } from '@/core/logger'

interface OdooAuthResult {
  uid: number
  name: string
  companyId: number
  companyName: string
  companyRut: string
  email: string
  groups: string[]
}

export class OdooAuthAdapter {
  private readonly rpcUrl: string

  constructor() {
    this.rpcUrl = `${config.ODOO_URL}/jsonrpc`
  }

  /**
   * Autentica usuario contra Odoo 18 vía JSON-RPC.
   * Retorna datos del usuario o null si las credenciales son incorrectas.
   */
  async authenticate(
    email: string,
    password: string,
    db: string = config.ODOO_DB,
  ): Promise<OdooAuthResult | null> {
    try {
      // Step 1: Login y obtener uid
      const authResponse = await axios.post(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'call',
          id: 1,
          params: {
            service: 'common',
            method: 'authenticate',
            args: [db, email, password, {}],
          },
        },
        { timeout: 10_000 },
      )

      const uid = authResponse.data?.result
      if (!uid || typeof uid !== 'number') {
        logger.warn({ email }, 'Odoo auth failed — invalid credentials')
        return null
      }

      // Step 2: Leer datos del usuario y empresa
      const userResponse = await axios.post(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'call',
          id: 2,
          params: {
            service: 'object',
            method: 'execute_kw',
            args: [
              db,
              uid,
              password,
              'res.users',
              'read',
              [[uid]],
              {
                fields: [
                  'name',
                  'email',
                  'company_id',
                  'company_ids',
                  'groups_id',
                  'vat', // RUT en el contexto chileno
                ],
              },
            ],
          },
        },
        { timeout: 10_000 },
      )

      const user = userResponse.data?.result?.[0]
      if (!user) {
        logger.error({ uid }, 'Could not read user data from Odoo')
        return null
      }

      // Leer RUT de la empresa (campo vat en res.company)
      const companyResponse = await axios.post(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'call',
          id: 3,
          params: {
            service: 'object',
            method: 'execute_kw',
            args: [
              db,
              uid,
              password,
              'res.company',
              'read',
              [[user.company_id[0]]],
              { fields: ['name', 'vat', 'street', 'city', 'phone', 'email'] },
            ],
          },
        },
        { timeout: 10_000 },
      )

      const company = companyResponse.data?.result?.[0]

      logger.info({ uid, email, companyId: user.company_id[0] }, 'Odoo auth success')

      return {
        uid,
        name: user.name as string,
        email: user.email as string,
        companyId: user.company_id[0] as number,
        companyName: (company?.name ?? 'Empresa') as string,
        companyRut: (company?.vat ?? '') as string,
        groups: (user.groups_id ?? []) as string[],
      }
    } catch (error) {
      logger.error({ error, email }, 'Odoo RPC error during authentication')
      return null
    }
  }

  /** Verifica conectividad con Odoo */
  async ping(): Promise<boolean> {
    try {
      const res = await axios.post(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'call',
          id: 1,
          params: { service: 'common', method: 'version', args: [] },
        },
        { timeout: 5_000 },
      )
      return !!res.data?.result
    } catch {
      return false
    }
  }
}

export const odooAuthAdapter = new OdooAuthAdapter()
