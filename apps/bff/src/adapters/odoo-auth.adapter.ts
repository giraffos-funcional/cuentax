/**
 * CUENTAX — Odoo Auth Adapter
 * ============================
 * Comunica con Odoo 18 vía JSON-RPC para autenticación.
 * Retorna uid del usuario autenticado o null si falla.
 */

import axios from 'axios'
import { config } from '@/core/config'
import { logger } from '@/core/logger'
import { getRequestId } from '@/core/request-context'
import { CircuitBreaker } from '@/core/circuit-breaker'

const odooAuthCircuit = new CircuitBreaker({
  name: 'odoo-auth',
  failureThreshold: 5,
  resetTimeout: 30_000,
})

interface OdooAuthResult {
  uid: number
  name: string
  companyId: number
  companyName: string
  companyRut: string
  email: string
  groups: string[]
  companyIds: number[]
  companies: Array<{
    id: number
    name: string
    rut: string
  }>
}

export class OdooAuthAdapter {
  private readonly rpcUrl: string

  constructor() {
    this.rpcUrl = `${config.ODOO_URL}/jsonrpc`
  }

  /** Build headers with correlation ID for distributed tracing */
  private get correlationHeaders(): Record<string, string> {
    const requestId = getRequestId()
    return requestId !== 'unknown' ? { 'X-Request-ID': requestId } : {}
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
      const authResponse = await odooAuthCircuit.execute(() =>
        axios.post(
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
          { timeout: 10_000, headers: this.correlationHeaders },
        ),
      )

      const uid = authResponse.data?.result
      if (!uid || typeof uid !== 'number') {
        logger.warn({ email }, 'Odoo auth failed — invalid credentials')
        return null
      }

      // Step 2: Leer datos del usuario y empresa
      const userResponse = await odooAuthCircuit.execute(() =>
        axios.post(
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
          { timeout: 10_000, headers: this.correlationHeaders },
        ),
      )

      const user = userResponse.data?.result?.[0]
      if (!user) {
        logger.error({ uid }, 'Could not read user data from Odoo')
        return null
      }

      // Read ALL companies the user has access to
      const companyIds = (user.company_ids ?? [user.company_id[0]]) as number[]

      const companiesResponse = await odooAuthCircuit.execute(() =>
        axios.post(
          this.rpcUrl,
          {
            jsonrpc: '2.0',
            method: 'call',
            id: 3,
            params: {
              service: 'object',
              method: 'execute_kw',
              args: [db, uid, password, 'res.company', 'read', [companyIds],
                { fields: ['name', 'vat', 'street', 'city', 'phone', 'email'] }],
            },
          },
          { timeout: 10_000, headers: this.correlationHeaders },
        ),
      )

      const companiesData = (companiesResponse.data?.result ?? []) as any[]
      const defaultCompany = companiesData.find((c: any) => c.id === user.company_id[0]) ?? companiesData[0]

      logger.info({ uid, email, companyId: user.company_id[0], companyCount: companyIds.length }, 'Odoo auth success')

      return {
        uid,
        name: user.name as string,
        email: user.email as string,
        companyId: user.company_id[0] as number,
        companyName: (defaultCompany?.name ?? 'Empresa') as string,
        companyRut: (defaultCompany?.vat || '') as string,
        groups: (user.groups_id ?? []) as string[],
        companyIds,
        companies: companiesData.map((c: any) => ({
          id: c.id,
          name: c.name ?? '',
          rut: c.vat || '',
        })),
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
export { odooAuthCircuit }
