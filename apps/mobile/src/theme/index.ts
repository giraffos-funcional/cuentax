/**
 * CUENTAX Mobile — Design Theme
 * Extracted from web app CSS variables for native consistency.
 */

export const colors = {
  // Brand
  brand: {
    violet400: '#a78bfa',
    violet500: '#8b5cf6',
    violet600: '#7c3aed',
    violet700: '#6d28d9',
    indigo500: '#6366f1',
    indigo600: '#4f46e5',
  },

  // Surfaces
  bg: {
    base: '#f8f9fc',
    surface: '#ffffff',
    elevated: '#f1f3f9',
  },

  // Borders
  border: {
    default: 'rgba(0, 0, 0, 0.08)',
    hover: 'rgba(0, 0, 0, 0.14)',
    light: '#e2e8f0',
    lighter: '#f1f5f9',
  },

  // Text
  text: {
    primary: '#1e293b',
    secondary: '#64748b',
    muted: '#94a3b8',
    inverse: '#ffffff',
  },

  // Status
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
    info: {
      text: '#1d4ed8',
      bg: '#eff6ff',
      border: '#bfdbfe',
    },
  },

  // Interactive
  active: {
    bg: '#f5f3ff',
    text: '#6d28d9',
    border: '#ddd6fe',
    icon: '#7c3aed',
  },

  hover: {
    bg: '#f8fafc',
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

export const typography = {
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 28,
    '3xl': 34,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
  button: 24,
  card: 16,
  input: 12,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  violet: {
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

export const theme = {
  colors,
  spacing,
  typography,
  radius,
  shadows,
} as const;

export type Theme = typeof theme;
