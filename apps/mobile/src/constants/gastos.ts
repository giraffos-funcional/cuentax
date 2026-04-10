/**
 * CUENTAX Mobile -- Gastos Constants
 * Category definitions, document types, and icon mappings.
 */

import type { Ionicons } from '@expo/vector-icons';

export interface CategoryDef {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

export const CATEGORIAS: CategoryDef[] = [
  { value: 'alimentacion', label: 'Alimentacion', icon: 'restaurant-outline', color: '#f97316' },
  { value: 'transporte', label: 'Transporte', icon: 'car-outline', color: '#3b82f6' },
  { value: 'oficina', label: 'Oficina', icon: 'briefcase-outline', color: '#8b5cf6' },
  { value: 'servicios', label: 'Servicios', icon: 'construct-outline', color: '#06b6d4' },
  { value: 'tecnologia', label: 'Tecnologia', icon: 'laptop-outline', color: '#6366f1' },
  { value: 'marketing', label: 'Marketing', icon: 'megaphone-outline', color: '#ec4899' },
  { value: 'profesionales', label: 'Profesionales', icon: 'people-outline', color: '#14b8a6' },
  { value: 'arriendo', label: 'Arriendo', icon: 'home-outline', color: '#f59e0b' },
  { value: 'suministros', label: 'Suministros', icon: 'flash-outline', color: '#eab308' },
  { value: 'seguros', label: 'Seguros', icon: 'shield-checkmark-outline', color: '#22c55e' },
  { value: 'impuestos', label: 'Impuestos', icon: 'receipt-outline', color: '#ef4444' },
  { value: 'bancarios', label: 'Bancarios', icon: 'card-outline', color: '#64748b' },
  { value: 'viajes', label: 'Viajes', icon: 'airplane-outline', color: '#0ea5e9' },
  { value: 'capacitacion', label: 'Capacitacion', icon: 'school-outline', color: '#a855f7' },
  { value: 'salud', label: 'Salud', icon: 'medkit-outline', color: '#10b981' },
  { value: 'otros', label: 'Otros', icon: 'ellipsis-horizontal-outline', color: '#94a3b8' },
];

export const CATEGORIA_MAP = Object.fromEntries(CATEGORIAS.map(c => [c.value, c]));

export const TIPOS_DOCUMENTO = [
  { value: 'boleta', label: 'Boleta' },
  { value: 'factura', label: 'Factura' },
  { value: 'nota_credito', label: 'Nota de Credito' },
  { value: 'nota_debito', label: 'Nota de Debito' },
  { value: 'guia_despacho', label: 'Guia de Despacho' },
  { value: 'sin_documento', label: 'Sin Documento' },
] as const;

export const TIPO_DOC_LABELS: Record<string, string> = Object.fromEntries(
  TIPOS_DOCUMENTO.map(t => [t.value, t.label]),
);

/** Month names in Spanish. */
export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
