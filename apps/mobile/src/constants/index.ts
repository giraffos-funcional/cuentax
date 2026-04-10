/**
 * CUENTAX Mobile — Constants
 * DTE types, categories, and SII status labels.
 */

export const DTE_TYPE_LABELS: Record<number, string> = {
  33: 'Factura',
  34: 'Factura Exenta',
  39: 'Boleta',
  41: 'Boleta No Afecta',
  46: 'Factura Compra',
  52: 'Guia Despacho',
  56: 'Nota Debito',
  61: 'Nota Credito',
  110: 'Factura Exportacion',
};

export const DTE_TYPE_SHORT: Record<number, string> = {
  33: 'FAC',
  34: 'FEX',
  39: 'BOL',
  41: 'BNA',
  46: 'FCO',
  52: 'GDE',
  56: 'NDC',
  61: 'NCC',
  110: 'FXP',
};

export const CATEGORY_LABELS: Record<string, string> = {
  oficina: 'Oficina',
  servicios: 'Servicios',
  transporte: 'Transporte',
  alimentacion: 'Alimentacion',
  tecnologia: 'Tecnologia',
  arriendo: 'Arriendo',
  marketing: 'Marketing',
  otros: 'Otros',
};

export const CATEGORY_ICONS: Record<string, string> = {
  oficina: 'briefcase',
  servicios: 'settings',
  transporte: 'car',
  alimentacion: 'utensils',
  tecnologia: 'monitor',
  arriendo: 'home',
  marketing: 'megaphone',
  otros: 'more-horizontal',
};

export const SII_STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  firmado: 'Firmado',
  enviado: 'Enviado',
  aceptado: 'Aceptado',
  aceptado_con_reparos: 'Aceptado con Reparos',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
};

export const SII_STATUS_COLORS: Record<
  string,
  { text: string; bg: string; border: string }
> = {
  borrador: { text: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  firmado: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  enviado: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  aceptado: { text: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
  aceptado_con_reparos: { text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  rechazado: { text: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  anulado: { text: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
};
