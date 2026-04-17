/**
 * CUENTAX — Feature Flags
 * ========================
 * Simple env-based feature flags for gradual rollout.
 * MVP: environment variables only. Later: per-company DB flags.
 */

import { config } from './config'

interface FeatureFlags {
  /** Enable US accounting features (import, classify, journal entries) */
  usaAccountingEnabled: boolean
  /** Enable AI transaction classification */
  aiClassificationEnabled: boolean
  /** Enable multi-currency display */
  multiCurrencyEnabled: boolean
}

function resolveFlags(): FeatureFlags {
  return {
    usaAccountingEnabled: process.env.FEATURE_USA_ACCOUNTING === 'true',
    aiClassificationEnabled: process.env.FEATURE_AI_CLASSIFICATION === 'true',
    multiCurrencyEnabled: process.env.FEATURE_MULTI_CURRENCY === 'true',
  }
}

/** Resolved feature flags (reads env vars once at startup) */
export const featureFlags: FeatureFlags = resolveFlags()

/** Check if a specific country is enabled */
export function isCountryEnabled(countryCode: string): boolean {
  switch (countryCode) {
    case 'CL': return true  // Chile always enabled
    case 'US': return featureFlags.usaAccountingEnabled
    default: return false
  }
}
