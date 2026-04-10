/**
 * CUENTAX Mobile -- Formatters
 * CLP currency, RUT, date formatters for Chilean locale.
 */

/**
 * Format number as Chilean Pesos (CLP): $1.234.567
 */
export function formatCLP(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return '$0';
  const rounded = Math.round(amount);
  const formatted = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return rounded < 0 ? `-$${formatted}` : `$${formatted}`;
}

/**
 * Format a RUT: 12345678-9 -> 12.345.678-9
 */
export function formatRUT(rut: string): string {
  const cleaned = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleaned.length < 2) return cleaned;

  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);

  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedBody}-${dv}`;
}

/**
 * Clean RUT to raw format: 12.345.678-9 -> 123456789
 */
export function cleanRUT(rut: string): string {
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

/**
 * Format ISO date to Chilean format: dd/mm/yyyy
 */
export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format ISO date to YYYY-MM-DD for API.
 */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validate Chilean RUT digit.
 */
export function validateRUT(rut: string): boolean {
  const cleaned = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleaned.length < 2) return false;

  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);

  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }

  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);

  return dv === expected;
}

/**
 * Format date as relative: "hace 2 horas", "ayer", etc.
 */
export function formatRelativeDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'Ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHr < 24) return `hace ${diffHr}h`;
  if (diffDay === 1) return 'Ayer';
  if (diffDay < 7) return `hace ${diffDay} dias`;
  return formatDate(dateStr);
}
