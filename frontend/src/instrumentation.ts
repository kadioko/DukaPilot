/**
 * Next.js instrumentation hook — loaded once on server startup.
 * Initialises Sentry for server-side error tracking.
 *
 * Required env var (server-only, not prefixed with NEXT_PUBLIC_):
 *   SENTRY_DSN
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  // Edge runtime: uncomment once sentry.edge.config.ts is created
  // if (process.env.NEXT_RUNTIME === "edge") {
  //   await import("../sentry.edge.config");
  // }
}
