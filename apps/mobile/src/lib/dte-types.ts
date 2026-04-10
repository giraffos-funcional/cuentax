/**
 * CUENTAX Mobile — DTE Type Definitions
 * Shared types for DTE documents, contacts, products.
 */

export interface DTEItem {
  nombre: string;
  descripcion?: string;
  cantidad: number;
  precio_unitario: number;
  descuento_porcentaje?: number;
  exento?: boolean;
}

export interface DTE {
  id: number;
  tipo_dte: number;
  folio: number;
  fecha: string;
  rut_receptor: string;
  razon_social_receptor: string;
  giro_receptor?: string;
  direccion_receptor?: string;
  comuna_receptor?: string;
  items: DTEItem[];
  monto_neto: number;
  monto_exento: number;
  monto_iva: number;
  monto_total: number;
  status: DTEStatus;
  track_id?: string;
  sii_status_detail?: string;
  xml_firmado_b64?: string;
  created_at: string;
  updated_at: string;
}

export type DTEStatus = 'pendiente' | 'enviado' | 'aceptado' | 'rechazado' | 'error';

export interface DTEListResponse {
  data: DTE[];
  total: number;
  page: number;
  limit: number;
}

export interface EmitirDTEPayload {
  tipo_dte: number;
  receptor: {
    rut: string;
    razon_social: string;
    giro: string;
    direccion?: string;
    comuna?: string;
  };
  items: DTEItem[];
  fecha?: string;
  referencia_folio?: number;
  referencia_tipo?: number;
  referencia_fecha?: string;
  referencia_razon?: string;
}

export interface EmitirDTEResult {
  success: boolean;
  dte_id?: number;
  folio?: number;
  track_id?: string;
  error?: string;
  details?: Record<string, string[]>;
}

export interface Contact {
  id: number;
  rut: string;
  razon_social: string;
  giro?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  comuna?: string;
  es_cliente: boolean;
  es_proveedor: boolean;
  notas?: string;
  created_at: string;
  updated_at: string;
}

export interface ContactListResponse {
  data: Contact[];
  total: number;
  page: number;
  limit: number;
}

export interface Product {
  id: number;
  codigo?: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  precio_con_iva?: number;
  unidad: string;
  exento: boolean;
  categoria?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductListResponse {
  data: Product[];
  total: number;
  page: number;
  limit: number;
}

/** DTE type code → human-readable name */
export const DTE_TYPE_LABELS: Record<number, string> = {
  33: 'Factura Electronica',
  34: 'Factura Exenta',
  39: 'Boleta Electronica',
  41: 'Boleta Exenta',
  56: 'Nota de Debito',
  61: 'Nota de Credito',
};

/** DTE type code → short label */
export const DTE_TYPE_SHORT: Record<number, string> = {
  33: 'Factura',
  34: 'Fact. Exenta',
  39: 'Boleta',
  41: 'Bol. Exenta',
  56: 'Nota Debito',
  61: 'Nota Credito',
};

/** Emission types available for the wizard */
export const EMITTABLE_TYPES = [
  { code: 33, name: 'Factura Electronica', description: 'Para ventas con IVA a empresas', icon: 'document-text' as const },
  { code: 39, name: 'Boleta Electronica', description: 'Para ventas a consumidor final', icon: 'receipt' as const },
  { code: 61, name: 'Nota de Credito', description: 'Para anulaciones y correcciones', icon: 'remove-circle' as const },
  { code: 56, name: 'Nota de Debito', description: 'Para cobros adicionales', icon: 'add-circle' as const },
];
