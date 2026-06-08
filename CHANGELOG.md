# Changelog — DukaPilot

All notable changes to DukaPilot are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.2.0] — 2026-06-08 — DukaPilot Rebrand & Operations

### Added

- Rebranded product, package names, logo asset, manifest, and public pages to **DukaPilot**.
- Added public `/about`, `/terms`, and `/privacy` pages with English/Swahili switching.
- Added public `/contact`, `/help`, and `/demo` pages.
- Added `/onboarding` as a five-step merchant setup checklist after registration.
- Added debt tracking with automatic debt creation for credit sales and payment status tracking.
- Added expense tracking by category.
- Added staff role management with PIN login and backend permission enforcement for selling, stock, staff, and reports.
- Added `/assistant` as the DukaPilot AI Assistant positioning and ranked recommendation surface.
- Added `npm run monitor:prod` for production health, CORS, catalog, login, dashboard, and stale API URL checks.
- Added manual subscription payment records, admin plan activation controls, shop suspension, and mutation-level subscription enforcement.
- Added staff PIN reset support for admins.
- Added browser-local offline sales queue with retry-on-reconnect sync.

### Fixed

- Improved `/pricing` with plan fit, inclusions, WhatsApp CTAs, and consistent public links.
- Improved `/catalog` empty/search state with merchant education, demo shop links, and WhatsApp/register CTAs.
- Improved AI Assistant cards with why-it-matters notes and direct workflow links.
- Updated production API defaults to `https://dukapilotproduction.up.railway.app/api`.
- Added a frontend fallback that rewrites the old Railway API URL to the new DukaPilot API URL if a stale Vercel env value is present.
- Allowed `https://dukapilot.vercel.app` in backend CORS.
- Bumped the service-worker cache to `dukapilot-v2` and stopped precaching `/` so stale login code does not persist after deploys.
- Updated express-rate-limit key generation to use the IPv6-safe helper.

---

## [1.1.0] — 2026-05-28 — Stability & Infrastructure Hardening

### Fixed

#### Backend — Express 5 error propagation

- All async controller functions in `sale`, `order`, `supplier`, `stock`, `dashboard`, `export`, `admin`, and `product` controllers were missing `asyncHandler` wrapping. Unhandled promise rejections now correctly propagate to the Express 5 error handler instead of crashing workers.
- `auth.controller.js` — `verifyOtp()` throws synchronously; it was not caught inside `asyncHandler`. Now wrapped in a `try/catch` that returns HTTP 400 instead of falling through to a 500.

#### Backend — Migration startup

- `scripts/migrate-and-start.js` — previously swallowed all migration errors silently. Now distinguishes "schema already current" (non-fatal, logs and continues) from unexpected failures (fatal — calls `process.exit(1)` so Railway restarts rather than serving with a stale schema).

### Changed

#### Backend — Infrastructure

- `Dockerfile` upgraded from `node:20` to `node:24-alpine`.
- Added `postgresql-client` to the Docker image (required by `scripts/backup.js` for `pg_dump`).
- Added explicit `COPY prisma.config.js ./` step so Prisma 7 CLI can find the datasource config inside the container.

#### Backend — Prisma config

- Removed duplicate `backend/prisma/prisma.config.js`. The canonical config is `backend/prisma.config.js` (the project root relative to the `backend/` working directory), which is where Prisma 7 CLI looks via c12/jiti.

#### Frontend — Tailwind 4

- Deleted `frontend/tailwind.config.ts` — Tailwind CSS 4 uses CSS `@theme` directives only; a JS config file is unused and misleading.

#### Frontend — TypeScript 6

- Removed `"ignoreDeprecations": "6.0"` from `frontend/tsconfig.json` — no longer needed after TypeScript 6 migration is complete.

### Added

#### Frontend — Sentry server-side init

- Added `frontend/src/instrumentation.ts` — required for `sentry.server.config.ts` to be loaded in Next.js 16. Without this file Sentry server-side error tracking was silently inactive.

#### Config

- `backend/.env.example` — documented `DATABASE_MIGRATE_URL` (public TCP proxy URL used by `migrate-and-start.js`).
- `frontend/.env.example` — created with `NEXT_PUBLIC_API_URL`, Sentry DSN vars, and app name.
- Both `package.json` files — added `"engines": { "node": ">=20" }`.

---

## [1.0.0] — 2026-05-26 — Go-Live Sprint

### Added — 1.0.0

#### Security & Authentication

- **OTP PIN recovery** — "Forgot PIN?" on login screen sends a 6-digit SMS code via Africa's Talking; user sets new PIN after verification.
- **Short-lived JWT (1h) + refresh token (30d)** — access tokens now expire in 1 hour; frontend silently refreshes via the secure `dukapilot_refresh` cookie; `/api/auth/refresh` endpoint added.
- **Logout endpoint** — `POST /api/auth/logout` clears both auth cookies.
- **Change PIN from settings** — authenticated users can change PIN by providing current PIN + new PIN via `PATCH /api/settings/pin`.
- **Admin PIN reset** — admins can look up any user by phone and reset their PIN via `PATCH /api/admin/users/:id/reset-pin`; all resets are audit-logged.
- **Public catalog rate limiting** — `/api/public/*` routes now have a separate limiter (30 req / 15 min per IP).
- **`/status` endpoint** — richer than `/health`; includes DB ping latency, uptime seconds, version, and environment.

#### Product Features

- **Settings page** (`/settings`) — merchants can update shop name, city, district, category, display name, language, and PIN from one place.
- **Customer orders view** (`/orders/customers`) — merchants see all inbound customer orders from their public shop catalog with status management (Confirm → Dispatch → Deliver / Cancel).
- **CustomerOrder stock deduction** — confirming a customer order decrements inventory; cancelling a CONFIRMED order releases stock back.
- **Registration form improvements** — registration now collects shop city, district, and category.
- **Admin dashboard UI** (`/admin`) — system overview stats, user list, PIN reset tool, and audit log viewer.
- **Africa's Talking OTP service** — full SMS OTP integration; falls back to console logging in dev when `AT_API_KEY` is not set.

#### Reliability & DevOps

- **pg_dump backup script** (`backend/scripts/backup.js`) — runs `pg_dump | gzip`, retains configurable number of days, scheduled via cron or Railway cron service.
- **Sentry error tracking** — backend `@sentry/node`; frontend `@sentry/nextjs`; both are no-ops when DSN env vars are not set.
- **`normalizeBaseUrl`** in frontend API client strips trailing newlines from `NEXT_PUBLIC_API_URL`.

### Changed — 1.0.0

- JWT access token expiry changed from 30 days to 1 hour (with refresh token for transparent re-auth).
- `dukapilot_token` cookie now holds short-lived access token; new `dukapilot_refresh` cookie added for 30-day refresh.

---

## [0.9.0] — Pre-Launch

### Added — 0.9.0

- Customer orders & public shop catalog (B2B2C channel)
- Wholesale pricing tier (retail / wholesale per product)
- Sale channels (POS / ONLINE) on sales records
- Admin routes and audit logging middleware
- Cookie-based authentication alongside Bearer token
- Expiry date tracking on products
- CSV export (sales + inventory) for merchants

### Existing Features (initial build)

- Merchant dashboard with period filters, charts, payment mix, all-time business history
- POS / sales entry with all Tanzanian payment methods
- Inventory management with low-stock alerts and stock adjustments
- Supplier ordering with WhatsApp export (Kiswahili message)
- One-tap reorder from previous orders
- Delivery confirmation with automatic stock restocking
- Supplier portal with order status management
- Full Kiswahili / English interface with per-user language preference
- Rate limiting (API + auth endpoints)
- Docker + Docker Compose for local development
- CI: backend unit tests, frontend typecheck, Playwright E2E, npm audit
