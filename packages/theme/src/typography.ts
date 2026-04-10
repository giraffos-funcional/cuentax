/**
 * @cuentax/theme — Typography tokens
 * Font sizes, weights, and line heights for consistent text rendering.
 */

export const fontFamily = {
  sans: ['Inter', 'system-ui', 'sans-serif'],
} as const

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const

export const lineHeight = {
  tight: 1.25,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
} as const

export const typography = {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} as const

export type Typography = typeof typography
