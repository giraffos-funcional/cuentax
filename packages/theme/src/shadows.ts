/**
 * @cuentax/theme — Shadow / elevation tokens
 * CSS box-shadow values for web; can be mapped to RN shadow props.
 */

export const shadows = {
  /** Subtle card shadow */
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  /** Default card elevation */
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
  /** Elevated cards, dropdowns */
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
  /** Modals, dialogs */
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
  /** FABs, top-level overlays */
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
  /** Brand glow effect */
  glow: '0 0 24px rgba(139, 92, 246, 0.15)',
  glowSm: '0 0 12px rgba(139, 92, 246, 0.1)',
  /** No shadow */
  none: 'none',
} as const

/**
 * React Native-compatible elevation map.
 * Use `rnElevation[level]` to get { shadowColor, shadowOffset, shadowOpacity, shadowRadius, elevation }.
 */
export const rnElevation = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 3 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5 },
  xl: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
  '2xl': { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12 },
} as const

export type Shadows = typeof shadows
export type RNElevation = typeof rnElevation
