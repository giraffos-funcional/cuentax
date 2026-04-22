/**
 * Unit tests for cost-center keyword matching and Airbnb CSV parsing.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db/client', () => ({ db: {} as any }))
vi.mock('@/core/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/adapters/odoo-accounting.adapter', () => ({ odooAccountingAdapter: {} as any }))

import { matchCostCenterByKeywords } from '@/services/cost-center.service'
import { parseAirbnbCsv } from '@/services/airbnb-parser.service'

describe('matchCostCenterByKeywords', () => {
  const centers = [
    { id: 1, keywords: ['PROV 101', 'GC PROVIDENCIA'] },
    { id: 2, keywords: ['REÑACA', 'CASA RENACA'] },
    { id: 3, keywords: ['LAS CONDES 405', 'LC 405'] },
    { id: 4, keywords: [] },
  ]

  it('returns null when no keyword matches', () => {
    expect(matchCostCenterByKeywords('GUSTO PAYROLL 04/15', centers)).toBeNull()
  })

  it('matches a simple keyword (case-insensitive)', () => {
    expect(matchCostCenterByKeywords('transferencia gc providencia mes abril', centers)).toBe(1)
    expect(matchCostCenterByKeywords('PAGO CASA REÑACA LIMPIEZA', centers)).toBe(2)
  })

  it('picks the longest keyword when multiple match', () => {
    const cs = [
      { id: 1, keywords: ['PROV'] },
      { id: 2, keywords: ['PROV 101'] },
    ]
    expect(matchCostCenterByKeywords('LIMPIEZA PROV 101 MES ABRIL', cs)).toBe(2)
  })

  it('ignores empty keyword strings', () => {
    const cs = [{ id: 1, keywords: ['', '   ', 'REAL'] }]
    expect(matchCostCenterByKeywords('algo REAL', cs)).toBe(1)
    expect(matchCostCenterByKeywords('otra cosa', cs)).toBeNull()
  })

  it('handles centers without keywords', () => {
    expect(matchCostCenterByKeywords('anything', [{ id: 1, keywords: [] }])).toBeNull()
  })
})

describe('parseAirbnbCsv', () => {
  const SAMPLE_EN = [
    'Date,Type,Start Date,Nights,Guest,Listing,Currency,Amount,Host Fee,Cleaning Fee',
    '04/15/2025,Reservation,04/20/2025,3,John Doe,"Apto Providencia 101",USD,300.00,30.00,50.00',
    '04/22/2025,Reservation,04/25/2025,5,Jane S,"Casa Reñaca",USD,500.00,50.00,75.00',
    '04/30/2025,Payout,,,,,,1200.00,,',
  ].join('\n')

  it('parses EN headers + reservations', () => {
    const r = parseAirbnbCsv(SAMPLE_EN)
    expect(r.reservations).toHaveLength(2)
    expect(r.unsupported_rows).toBe(1)
    expect(r.reservations[0].listing).toBe('Apto Providencia 101')
    expect(r.reservations[0].gross_amount).toBe(300)
    expect(r.reservations[0].host_fee).toBe(30)
    expect(r.reservations[0].cleaning_fee).toBe(50)
    expect(r.reservations[0].nights).toBe(3)
  })

  it('extracts unique listings with counts and totals', () => {
    const r = parseAirbnbCsv(SAMPLE_EN)
    const byName = Object.fromEntries(r.listings.map(l => [l.name, l]))
    expect(byName['Casa Reñaca'].count).toBe(1)
    expect(byName['Casa Reñaca'].total_gross).toBe(500)
  })

  it('parses Spanish headers too', () => {
    const es = [
      'Fecha,Tipo,Fecha de inicio,Noches,Huésped,Anuncio,Moneda,Monto,Comisión del anfitrión,Tarifa de limpieza',
      '15/04/2025,Reserva,20/04/2025,3,Juan,"Dpto Las Condes 405",CLP,200000,20000,30000',
    ].join('\n')
    const r = parseAirbnbCsv(es)
    expect(r.reservations).toHaveLength(1)
    expect(r.reservations[0].currency).toBe('CLP')
    expect(r.reservations[0].gross_amount).toBe(200000)
    // Spanish date DD/MM/YYYY
    expect(r.reservations[0].start_date).toBe('2025-04-20')
  })

  it('returns parse_errors for missing critical columns', () => {
    const bad = 'Foo,Bar,Baz\n1,2,3\n'
    const r = parseAirbnbCsv(bad)
    expect(r.parse_errors.length).toBeGreaterThan(0)
    expect(r.reservations).toHaveLength(0)
  })

  it('handles empty file gracefully', () => {
    const r = parseAirbnbCsv('')
    expect(r.reservations).toHaveLength(0)
    expect(r.parse_errors.length).toBeGreaterThan(0)
  })

  it('computes end_date from start + nights', () => {
    const r = parseAirbnbCsv(SAMPLE_EN)
    // Start 04/20/2025 + 3 nights = 04/23/2025
    expect(r.reservations[0].end_date).toBe('2025-04-23')
  })

  it('detects date range across reservations', () => {
    const r = parseAirbnbCsv(SAMPLE_EN)
    expect(r.date_range).toEqual({ from: '2025-04-15', to: '2025-04-22' })
  })
})
