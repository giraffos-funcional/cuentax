/**
 * @cuentax/theme — Color tokens
 * Extracted from globals.css CSS variables and tailwind.config.ts brand scale.
 */

export const colors = {
  brand: {
    50: '#f5f3ff',
    100: '#ede9fe',
    200: '#ddd6fe',
    300: '#c4b5fd',
    400: '#a78bfa',
    500: '#8b5cf6',
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
  },
  indigo: {
    500: '#6366f1',
    600: '#4f46e5',
  },
  surface: {
    base: '#f8f9fc',
    card: '#ffffff',
    elevated: '#f1f3f9',
  },
  text: {
    primary: '#1e293b',
    secondary: '#64748b',
    muted: '#94a3b8',
  },
  border: {
    default: 'rgba(0, 0, 0, 0.08)',
    hover: 'rgba(0, 0, 0, 0.14)',
    light: '#e2e8f0',
    lighter: '#f1f5f9',
  },
  interactive: {
    hoverBg: '#f8fafc',
    activeBg: '#f5f3ff',
    activeText: '#6d28d9',
    activeBorder: '#ddd6fe',
    activeIcon: '#7c3aed',
  },
  status: {
    ok: {
      text: '#047857',
      bg: '#ecfdf5',
      border: '#a7f3d0',
    },
    warn: {
      text: '#b45309',
      bg: '#fffbeb',
      border: '#fde68a',
    },
    error: {
      text: '#dc2626',
      bg: '#fef2f2',
      border: '#fecaca',
    },
  },
} as const

export type Colors = typeof colors
