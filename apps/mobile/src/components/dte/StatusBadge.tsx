/**
 * SII Status Badge — color-coded pill for DTE status.
 */

import React from 'react';
import { Badge } from '@/components/ui';
import type { DTEStatus } from '@/lib/dte-types';

interface StatusBadgeProps {
  status: DTEStatus;
}

const STATUS_CONFIG: Record<DTEStatus, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
  aceptado:  { label: 'Aceptado',  variant: 'success' },
  rechazado: { label: 'Rechazado', variant: 'error' },
  pendiente: { label: 'Pendiente', variant: 'warning' },
  enviado:   { label: 'Enviado',   variant: 'info' },
  error:     { label: 'Error',     variant: 'error' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pendiente;
  return <Badge label={config.label} variant={config.variant} />;
}
