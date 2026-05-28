# Changelog — DukaOS

All notable changes to DukaOS are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — Go-Live Sprint

### Added

#### Security & Authentication
- **OTP PIN recovery** — "Forgot PIN?" on login screen sends a 6-digit SMS code via Africa's Talking; user sets new PIN after verification
- **Short-lived JWT (1h) + refresh token (30d)** — access tokens now expire in 1 hour; frontend transparently refreshes using the secure `dukaos_refresh` cookie; `/api/auth/refresh` endpoint added
- **Change PIN from settings** — authenticated users can change their own PIN by providing current PIN + new PIN via `/api/settings/pin`
- **Admin PIN reset** — admins can look up any user by phone and reset their PIN via `/api/admin/users/:id/reset-pin` (all resets are audit-logged)
- **Public catalog rate limiting** — `/api/public/*` routes now have a separate limiter (30 req / 15 min per IP) to prevent abuse/scraping
- **`/status` endpoint** — richer than `/health`; includes DB ping latency, uptime seconds, version, and environment

#### Product Features
- **Settings page** (`/settings`) — merchants can update shop name, city, district, category, display name, language, and PIN from one place
- **Customer orders view** (`/orders/customers`) — merchants now see all inbound customer orders from their public shop catalog, with status management (Confirm → Dispatch → Deliver / Cancel)
- **CustomerOrder stock deduction** — confirming a customer order now reserves stock (decrements inventory); cancelling a CONFIRMED order releases the stock back
- **Registration form improvements** — registration now collects shop city, district, and category (previously defaulted to "Dar es Salaam / general" for all users)
- **Admin dashboard UI** — admin users now see a full dashboard with: system overview stats, user list, PIN reset tool, and audit log viewer
- **Africa's Talking OTP service** — full SMS OTP integration; falls back to console logging in dev mode when `AT_API_KEY` is not set

#### Reliability & DevOps
- **pg_dump backup script** (`backend/scripts/backup.js`) — runs `pg_dump | gzip`, retains configurable number of days, can be scheduled with cron or Railway cron service
- **Sentry error tracking** — backend uses `@sentry/node`; frontend uses `@sentry/nextjs`; both are no-ops when DSN env vars are not set
- **`normalizeBaseUrl`** in frontend API client now strips trailing newlines from `NEXT_PUBLIC_API_URL` (fixes misconfigured env var)

#### Documentation
- This `CHANGELOG.md`
- `backend/.env.example` updated with all new env vars
- `TESTING.md` updated with new test procedures
- `README.md` updated to reflect new features

### Changed
- JWT access token expiry changed from 30 days to 1 hour (with refresh token for transparent re-auth)
- `dukaos_token` cookie now holds short-lived access token; new `dukaos_refresh` cookie added for 30-day refresh

---

## [0.9.0] — Pre-Launch (prior work)

### Added
- Customer orders & public shop catalog (B2B2C channel)
- Wholesale pricing tier (retail / wholesale per product)
- Sale channels (POS / ONLINE) on sales records
- Admin routes and audit logging middleware
- Cookie-based authentication alongside Bearer token
- Expiry date tracking on products
- CSV export (sales + inventory) for merchants

### Existing Features (from initial build)
- Merchant dashboard with period filters, charts, payment mix, business history
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
