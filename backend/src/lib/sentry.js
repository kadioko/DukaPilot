/**
 * Sentry error tracking — DukaPilot Backend
 *
 * Required env var:
 *   SENTRY_DSN — your Sentry project DSN
 *   NODE_ENV   — 'production' | 'development'
 *
 * If SENTRY_DSN is not set, Sentry is disabled silently.
 */

const Sentry = require("@sentry/node");

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1, // 10% of transactions
    ignoreErrors: [
      "Unauthorized",
      "Forbidden",
      "Not found",
    ],
  });
  console.log("[sentry] Initialized");
} else {
  console.log("[sentry] SENTRY_DSN not set — error tracking disabled");
}

module.exports = Sentry;
