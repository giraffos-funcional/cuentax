/**
 * Register the CuentaX service worker for PWA offline support.
 * Call this once from a client component on mount.
 */
export function registerServiceWorker(): void {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        // SW registration is non-critical — log and move on
        if (process.env.NODE_ENV === 'development') {
          console.warn('SW registration failed:', err);
        }
      });
    });
  }
}
