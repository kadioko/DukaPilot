/**
 * Next.js client instrumentation entry point.
 * This file is bundled automatically and initializes browser-side Sentry.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.0,
    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
    beforeSend(event) {
      const values = event.exception?.values || [];
      const isInjectedAndroidBridgeError = values.some((exception) =>
        exception.value?.includes("Error invoking postMessage: Java object is gone") &&
        exception.stacktrace?.frames?.some((frame) => frame.filename?.startsWith("app://navigation_performance_logger_android")),
      );
      return isInjectedAndroidBridgeError ? null : event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
