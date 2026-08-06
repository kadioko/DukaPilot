/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || "development",
  },
  async rewrites() {
    return [{
      source: "/_api/:path*",
      destination: "https://dukapilotproduction.up.railway.app/api/:path*",
    }];
  },
  async headers() {
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://dukapilotproduction.up.railway.app https://*.sentry.io https://*.ingest.sentry.io",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/(.*)",
        headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
