/**
 * CUENTAX — Circuit Breaker (inline implementation)
 * ===================================================
 * Lightweight circuit breaker to prevent cascading failures when downstream
 * services (SII Bridge, Odoo) are unavailable. No external dependencies.
 *
 * States:
 *   closed    → requests flow normally, failures are counted
 *   open      → requests are rejected immediately (fail fast)
 *   half-open → a single probe request is allowed through to test recovery
 */

import { logger } from './logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
  /** Human-readable name for logging */
  name: string
  /** Number of failures before the circuit opens (default: 5) */
  failureThreshold?: number
  /** Milliseconds before transitioning from open → half-open (default: 30 000) */
  resetTimeout?: number
  /** Window in ms — failures older than this are not counted (default: 60 000) */
  monitorInterval?: number
}

interface RequiredOptions {
  name: string
  failureThreshold: number
  resetTimeout: number
  monitorInterval: number
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class CircuitOpenError extends Error {
  constructor(circuitName: string) {
    super(`Circuit breaker '${circuitName}' is OPEN — service unavailable`)
    this.name = 'CircuitOpenError'
  }
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failures = 0
  private lastFailureTime = 0
  private readonly options: RequiredOptions

  constructor(opts: CircuitBreakerOptions) {
    this.options = {
      name: opts.name,
      failureThreshold: opts.failureThreshold ?? 5,
      resetTimeout: opts.resetTimeout ?? 30_000,
      monitorInterval: opts.monitorInterval ?? 60_000,
    }
  }

  /**
   * Wraps an async operation with circuit breaker protection.
   * Throws `CircuitOpenError` when the circuit is open and the reset
   * timeout has not yet elapsed.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeout) {
        this.state = 'half-open'
        logger.info({ circuit: this.options.name }, 'Circuit half-open, probing...')
      } else {
        throw new CircuitOpenError(this.options.name)
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure()
      throw err
    }
  }

  /**
   * Returns the current circuit state for health-check reporting.
   * Automatically transitions open → half-open if the reset timeout elapsed.
   */
  getState(): { name: string; state: CircuitState; failures: number } {
    if (
      this.state === 'open' &&
      Date.now() - this.lastFailureTime > this.options.resetTimeout
    ) {
      this.state = 'half-open'
    }

    return {
      name: this.options.name,
      state: this.state,
      failures: this.failures,
    }
  }

  // ── Internal ────────────────────────────────────────────────

  private onSuccess(): void {
    if (this.state === 'half-open') {
      logger.info(
        { circuit: this.options.name },
        'Circuit closed (probe succeeded)',
      )
    }
    this.failures = 0
    this.state = 'closed'
  }

  private onFailure(): void {
    const now = Date.now()

    // Reset failure count if the last failure was outside the monitor window
    if (now - this.lastFailureTime > this.options.monitorInterval) {
      this.failures = 0
    }

    this.failures++
    this.lastFailureTime = now

    if (this.failures >= this.options.failureThreshold) {
      this.state = 'open'
      logger.error(
        { circuit: this.options.name, failures: this.failures },
        'Circuit OPEN',
      )
    }
  }
}
