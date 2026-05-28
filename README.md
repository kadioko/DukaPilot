# DukaOS — Merchant OS for Tanzania

> **Merchant operating system for informal retailers in Tanzania.**
> Track stock, record sales, order from suppliers, and grow your business — all in Kiswahili, from your phone.

---

## Why DukaOS

Tanzania has over **1 million informal operators** in Dar es Salaam alone, with wholesale/retail as the single largest segment. These merchants lose money every day from:

- Stockouts they never saw coming
- Cash they cannot reconcile
- Suppliers they can only reach by walking to the market
- Records kept in notebooks that get lost

Mobile money adoption is strong and growing. The infrastructure exists. What is missing is a tool built for how these merchants actually work — in Kiswahili, on a basic smartphone, with no training required.

DukaOS starts as **software + payments + procurement**, then layers working-capital financing later once trust and compliance are established.

---

## Live Production

- **Frontend:** [https://duka-os.vercel.app/](https://duka-os.vercel.app/)
- **Backend API:** [https://dukaos-production.up.railway.app/api](https://dukaos-production.up.railway.app/api)
- **Health:** [https://dukaos-production.up.railway.app/health](https://dukaos-production.up.railway.app/health)
- **Status:** [https://dukaos-production.up.railway.app/status](https://dukaos-production.up.railway.app/status)

---

## What DukaOS Does

### For Merchants (Wafanyabiashara)

| Feature | Description |
| --- | --- |
| **Inventory tracking** | Add products, set buying/selling/wholesale prices, track stock levels |
| **Low-stock alerts** | Instant badge + dashboard alert when any product hits minimum stock |
| **POS / Sales entry** | Record sales by product, quantity, and payment method |
| **Profit snapshot** | Real-time profit margin per sale and daily/weekly/monthly/all-time totals |
| **Business history** | All-time business history and monthly performance trends from the dashboard |
| **Supplier ordering** | Create orders from suppliers in one tap |
| **WhatsApp export** | Every order generates a ready-to-send WhatsApp message in Kiswahili |
| **One-tap reorder** | Repeat any previous order with a single button |
| **Delivery confirmation** | Confirm goods received and auto-restock inventory |
| **Customer orders** | Public shop catalog; customers can place orders; merchant manages them |
| **Payment reconciliation** | Bank, M-Pesa, Tigo Pesa, Airtel Money, HaloPesa, Cash, Credit |
| **Settings** | Update shop name, location, category, display name, language, and PIN in one place |
| **PIN recovery** | "Forgot PIN?" sends a 6-digit OTP via SMS (Africa's Talking) |
| **Language switching** | Full Kiswahili interface with an in-app English/Swahili toggle |
| **CSV export** | Download sales history or full inventory as a CSV file |

### For Suppliers (Wasambazaji)

| Feature | Description |
| --- | --- |
| **Order dashboard** | See all incoming orders from merchants |
| **Status management** | PENDING → CONFIRMED → OUT_FOR_DELIVERY (merchant confirms delivery) |
| **Route view** | Group pending orders by location |
| **Performance data** | Which merchants order most frequently |

### For Admins

| Feature | Description |
| --- | --- |
| **System overview** | User, shop, product, sale, and order counts |
| **User management** | List all users; look up any user by phone |
| **PIN reset** | Reset any user's PIN (all resets are audit-logged) |
| **Audit log viewer** | Searchable log of all significant actions |

---

## Revenue Model

| Stream | Target |
| --- | --- |
| Merchant subscriptions | ~300 merchants × TZS 25,000/month = **TZS 7.5M MRR** |
| Supplier subscriptions | ~20 suppliers × TZS 375,000/month = **TZS 7.5M MRR** |
| Transaction/procurement fees | % of GMV flowing through orders |
| Onboarding & training | One-time setup fees |
| **Working-capital financing** | Later stage, with BoT microfinance license or licensed partner |

**Path to TZS 25M MRR (~$10k/month):** 300 merchants + 20 suppliers + transaction fees + setup. No thousands of users needed before revenue.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Backend** | Node.js 24 · Express 5 · Prisma ORM 7 |
| **Database** | PostgreSQL |
| **Frontend** | Next.js 16 · React 19 · TypeScript 6 · Tailwind CSS 4 |
| **Auth** | JWT (1h access + 30d refresh cookie) · phone + PIN login · OTP PIN recovery |
| **SMS / OTP** | Africa's Talking (sandbox in dev, live in production) |
| **Error tracking** | Sentry (`@sentry/node` + `@sentry/nextjs`) |
| **Messaging** | WhatsApp deep links + WhatsApp Cloud API (optional) |
| **Payments** | Cash, Bank, Credit, M-Pesa, Tigo Pesa, Airtel Money, HaloPesa |
| **Charts** | Recharts |
| **Containerisation** | Docker (node:24-alpine) + Docker Compose |
| **Hosting** | Railway (backend + Postgres) · Vercel (frontend) |

---

## Authentication

- **Login:** phone number + PIN → JWT access token (1h) + `dukaos_refresh` cookie (30d)
- **Refresh:** frontend silently renews the access token via `POST /api/auth/refresh` — no visible logout
- **PIN recovery:** "Forgot PIN?" on login screen → 6-digit SMS OTP via Africa's Talking → set new PIN
- **Change PIN:** authenticated users can change PIN from `/settings`
- **Admin PIN reset:** admin can reset any user's PIN via `/admin` (audit-logged)
- **Registration:** collects phone, PIN, name, role (MERCHANT / SUPPLIER), shop city, district, and category

### Security Notes

- Rate limiting is applied on all `/api/*` routes (100 req / 15 min) and tighter on `/api/auth/*` and `/api/public/*`.
- Never commit real secrets to git — keep `DATABASE_URL`, `JWT_SECRET`, and payment credentials in environment variables only.
- OTP codes expire after 10 minutes and are single-use.

---

## Project Structure

```text
DukaOS/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Full data model
│   │   ├── seed.js                # Demo merchant + supplier data
│   │   └── migrations/            # Prisma migration history
│   ├── prisma.config.js           # Prisma 7 datasource config (read by CLI)
│   ├── scripts/
│   │   ├── migrate-and-start.js   # Railway startup: migrate then start
│   │   ├── backup.js              # pg_dump + gzip backup
│   │   └── smoke-test.js          # Production smoke checks
│   ├── src/
│   │   ├── app.js                 # Express entrypoint
│   │   ├── lib/
│   │   │   ├── prisma.js          # Prisma client singleton
│   │   │   └── sentry.js          # Sentry initialisation
│   │   ├── middleware/
│   │   │   ├── auth.js            # JWT middleware
│   │   │   ├── audit.js           # Audit trail middleware
│   │   │   └── rateLimit.js       # express-rate-limit config
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── product.controller.js
│   │   │   ├── sale.controller.js
│   │   │   ├── order.controller.js
│   │   │   ├── customerOrder.controller.js
│   │   │   ├── supplier.controller.js
│   │   │   ├── stock.controller.js
│   │   │   ├── dashboard.controller.js
│   │   │   ├── export.controller.js
│   │   │   ├── settings.controller.js
│   │   │   └── admin.controller.js
│   │   ├── routes/                # One file per resource
│   │   └── services/
│   │       ├── whatsapp.service.js   # WhatsApp message builder
│   │       └── otp.service.js        # Africa's Talking OTP
│   ├── Dockerfile                 # node:24-alpine
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx               # Login / Register
│   │   │   ├── dashboard/page.tsx     # Business overview + charts
│   │   │   ├── inventory/page.tsx     # Product list, stock adjustment
│   │   │   ├── sales/page.tsx         # POS + history
│   │   │   ├── orders/
│   │   │   │   ├── page.tsx           # Supplier orders + WhatsApp
│   │   │   │   └── customers/page.tsx # Inbound customer orders
│   │   │   ├── suppliers/page.tsx     # Supplier directory
│   │   │   ├── supplier/page.tsx      # Supplier portal
│   │   │   ├── settings/page.tsx      # Shop + account settings
│   │   │   ├── admin/page.tsx         # Admin dashboard
│   │   │   └── catalog/               # Public shop catalog (B2B2C)
│   │   ├── components/
│   │   │   └── layout/AppShell.tsx    # Sidebar + mobile nav
│   │   ├── instrumentation.ts         # Sentry server-side init (Next.js 16)
│   │   └── lib/
│   │       ├── api.ts                 # Typed fetch wrapper
│   │       └── i18n.ts                # Kiswahili / English translations
│   ├── sentry.client.config.ts
│   ├── sentry.server.config.ts
│   ├── .env.example
│   └── package.json
│
└── docker-compose.yml
```

---

## Database Schema

```text
User ──────── Shop ──────────── Product ──────── StockMovement
               │                    │
               ├──── Sale ──────────┘ (SaleItem)
               ├──── Order ──── Supplier
               │       └────── (OrderItem)
               └──── CustomerOrder
                         └──── (CustomerOrderItem)
```

**Core models:**

- `User` — merchant, supplier, or admin; identified by phone + PIN
- `Shop` — one shop per merchant (extensible to multi-shop); has name, location, district, category
- `Supplier` — can optionally have a User account (supplier portal)
- `Product` — SKU, buying/selling/wholesale price, stock level, minimum threshold, expiry date
- `Sale` + `SaleItem` — each sale records profit per line item; supports POS and ONLINE channels
- `StockMovement` — full audit trail of every stock change (IN / OUT / ADJUSTMENT)
- `Order` + `OrderItem` — merchant-to-supplier purchase orders with status lifecycle
- `CustomerOrder` + `CustomerOrderItem` — customer-to-merchant orders from public catalog
- `AuditLog` — records significant actions with user, method, path, IP, and metadata

---

## Getting Started

### Prerequisites

- Docker + Docker Compose, **or** Node.js 20+ and PostgreSQL

### Quick Start with Docker

```bash
git clone https://github.com/your-org/DukaOS.git
cd DukaOS

# Copy and fill in env files
cp backend/.env.example backend/.env
# Edit backend/.env: set DATABASE_URL and JWT_SECRET

# Start everything
docker-compose up --build

# In a separate terminal — seed test data
docker-compose exec backend node prisma/seed.js
```

The app will be available at:

- **Frontend:** [http://localhost:3000](http://localhost:3000)
- **Backend API:** [http://localhost:4000/api](http://localhost:4000/api)

### Local Development (without Docker)

```bash
# 1. Database
createdb dukaos

# 2. Backend
cd backend
cp .env.example .env
# Edit .env: set DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate dev --name init
node prisma/seed.js
npm run dev         # runs on :4000

# 3. Frontend (new terminal)
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local: NEXT_PUBLIC_API_URL=http://localhost:4000/api
npm run dev         # runs on :3000
```

### Local Verification Checklist

- Backend health responds at `http://localhost:4000/health`
- Status endpoint responds at `http://localhost:4000/status`
- Frontend loads at `http://localhost:3000`
- Test merchant can log in
- Dashboard `All Time` tab renders
- Sales page shows `Bank` as a payment option
- Language toggle persists after refresh

### Production Environment Variables

#### Backend (Railway)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Private PostgreSQL connection URL |
| `DATABASE_MIGRATE_URL` | Yes | Public TCP proxy URL for `prisma migrate deploy` at startup |
| `JWT_SECRET` | Yes | Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `NODE_ENV` | Yes | Set to `production` |
| `FRONTEND_URL` | Yes | Vercel frontend URL for CORS |
| `AT_API_KEY` | Recommended | Africa's Talking key for SMS OTP |
| `AT_USERNAME` | Recommended | Africa's Talking username (`sandbox` for testing) |
| `AT_SENDER_ID` | Optional | Custom SMS sender ID |
| `SENTRY_DSN` | Optional | Sentry project DSN for error tracking |
| `WHATSAPP_API_URL` | Optional | WhatsApp Cloud API URL |
| `WHATSAPP_API_TOKEN` | Optional | WhatsApp Cloud API token |
| `WHATSAPP_PHONE_ID` | Optional | WhatsApp Business phone number ID |
| `BACKUP_DIR` | Optional | Directory for pg_dump backups (default: `./backups`) |
| `BACKUP_RETAIN_DAYS` | Optional | Days to keep backups (default: `7`) |

#### Frontend (Vercel)

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL — no trailing slash or newline |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Sentry DSN for client-side error tracking |
| `SENTRY_DSN` | Optional | Sentry DSN for server-side (SSR) error tracking |

### Production Database Workflow

- **Startup command:** `node scripts/migrate-and-start.js` (runs `prisma migrate deploy` then starts the app; fatal migration failures cause `process.exit(1)` so Railway restarts rather than serving stale schema)
- **Manual migration:** `npm run db:deploy`
- **Policy:** create and commit Prisma migrations in git, then let production apply them with `prisma migrate deploy`
- **Do not use in production:** `prisma migrate dev`, `prisma db push`

### Deployment Checklist

1. Push changes to `main`.
2. Confirm Railway has `DATABASE_URL`, `DATABASE_MIGRATE_URL`, `JWT_SECRET`, and `FRONTEND_URL` set.
3. Deploy backend from the `backend/` root using the Dockerfile (`node scripts/migrate-and-start.js` is the container entrypoint via `railway.toml`).
4. Deploy frontend on Vercel with `NEXT_PUBLIC_API_URL` pointing to the Railway API URL.
5. Verify Railway healthcheck path is `/health`.
6. Run `cd backend && npm run smoke:prod` and `cd frontend && npm run smoke` against the live URLs.
7. Run `cd frontend && npm run smoke:login` for the browser login/dashboard/sales/logout smoke flow.
8. Review `TESTING.md` for the full manual and automated test checklist.

---

## Demo Accounts (after seeding)

All PINs: `1234`

| Role | Phone | Name / Shop | Notes |
| --- | --- | --- | --- |
| Admin | +255700000000 | Admin DukaOS | System administration |
| Merchant | +255700000002 | Mama Amina / Duka la Amina | Grocery, Mbagala (Temeke) — 8 products, 7 days sales history |
| Test Merchant | +255700000003 | Salum / Salum Pharmacy | Pharmacy, Kinondoni — 3 products |
| Supplier | +255700000001 | Jumla Traders Ltd | Kariakoo, Dar es Salaam |

---

## API Reference

All authenticated endpoints require `Authorization: Bearer <token>` or the `dukaos_token` cookie.

### Auth

```text
POST   /api/auth/register              # Register new merchant or supplier
POST   /api/auth/login                 # Login — returns JWT + sets refresh cookie
POST   /api/auth/logout                # Clear auth cookies
POST   /api/auth/refresh               # Silently renew access token using refresh cookie
GET    /api/auth/me                    # Get current user profile
PATCH  /api/auth/language              # Switch UI language (sw / en)
POST   /api/auth/otp/request           # Request OTP for PIN recovery
POST   /api/auth/otp/verify-reset      # Verify OTP and set new PIN
```

### Settings (Authenticated)

```text
GET    /api/settings                   # Get current user + shop settings
PATCH  /api/settings/shop              # Update shop name, city, district, category
PATCH  /api/settings/profile           # Update display name
PATCH  /api/settings/language          # Change language preference
PATCH  /api/settings/pin               # Change PIN (requires current PIN)
```

### Products (Merchant only)

```text
GET    /api/products                   # List products (search, filter, pagination)
GET    /api/products/low-stock         # Products at or below minimum stock
GET    /api/products/:id               # Product detail + stock movement history
POST   /api/products                   # Create product
PATCH  /api/products/:id               # Update product
DELETE /api/products/:id               # Soft-delete (deactivate)
```

### Stock

```text
POST   /api/stock/adjust               # Adjust stock (IN / OUT / ADJUSTMENT)
GET    /api/stock/:productId/movements # Full audit trail for a product
```

### Sales

```text
GET    /api/sales                      # Sale history (filterable by date range)
GET    /api/sales/summary              # Aggregated totals by period (today/week/month)
GET    /api/sales/:id                  # Sale detail
POST   /api/sales                      # Record a sale (auto-decrements stock)
```

### Orders (Merchant → Supplier)

```text
GET    /api/orders                          # List orders (filterable by status)
GET    /api/orders/:id                      # Order detail + WhatsApp message
POST   /api/orders                          # Create order (returns WhatsApp message)
POST   /api/orders/:id/reorder              # One-tap repeat of previous order
PATCH  /api/orders/:id/confirm-delivery     # Receive goods (auto-increments stock)
PATCH  /api/orders/:id/cancel              # Cancel order
```

### Customer Orders (Inbound — Merchant manages)

```text
GET    /api/customer-orders                            # List inbound customer orders
GET    /api/customer-orders/:id                        # Order detail
POST   /api/customer-orders                            # Place customer order (public)
PATCH  /api/customer-orders/:id/status                 # Advance status (CONFIRMED → DELIVERED)
PATCH  /api/customer-orders/:id/cancel                 # Cancel order
```

### Suppliers

```text
GET    /api/suppliers                               # List all suppliers
GET    /api/suppliers/:id                           # Supplier detail
POST   /api/suppliers                               # Add supplier
PATCH  /api/suppliers/:id                           # Update supplier

# Supplier portal (Supplier role)
GET    /api/suppliers/portal/orders                 # My incoming orders
GET    /api/suppliers/portal/dashboard              # Dashboard stats
PATCH  /api/suppliers/portal/orders/:orderId/status # Update order status
```

### Dashboard

```text
GET    /api/dashboard?period=today|week|month|all   # Full business overview, payment mix, charts, all-time history
```

### Exports (Merchant / Admin)

```text
GET    /api/exports/sales      # Download sales as CSV
GET    /api/exports/inventory  # Download inventory as CSV
```

### Admin (Admin role only)

```text
GET    /api/admin/overview                  # System-wide stats
GET    /api/admin/users                     # List all users
GET    /api/admin/users/search?phone=...    # Find user by phone
PATCH  /api/admin/users/:userId/reset-pin   # Reset a user's PIN
GET    /api/admin/audit-logs                # Audit log (filterable)
```

### Public (no auth)

```text
GET    /api/public/shops/:shopId/products   # Public product catalog for a shop
```

### System

```text
GET    /health   # {"status":"ok","service":"DukaOS API"}
GET    /status   # DB ping, uptime, version, environment
```

---

## Testing and QA

See `TESTING.md` for the full manual smoke checklist, automated test commands, and deployment readiness checks.

### Quick commands

```bash
# Backend
cd backend && npm run smoke:prod   # production smoke test
cd backend && npm run test:api     # integration tests

# Frontend
cd frontend && npm run smoke       # page load smoke
cd frontend && npm run smoke:login # Playwright browser smoke
cd frontend && npm run test:auth   # auth negative-path E2E
cd frontend && npm run test:e2e    # full Playwright suite
cd frontend && npm run typecheck   # TypeScript type check
```

---

## WhatsApp Integration

Every supplier order automatically generates a WhatsApp message in Kiswahili:

```text
AGIZO JIPYA - Duka la Amina
Tarehe: 6 Machi 2026
Nambari ya Agizo: #A1B2C3D4

Bidhaa Zilizoagizwa:
  - Unga wa Sembe (2kg): 10 bag
  - Mchele (1kg): 20 kg
  - Mafuta ya Kupikia (1L): 12 litre

Jumla ya Thamani: TZS 85,600
Mahali pa Biashara: Mbagala, Temeke

Tafadhali thibitisha agizo hili. Asante!
```

The frontend provides a **"Fungua WhatsApp"** button that opens WhatsApp with the pre-filled message. For API-driven sending, configure `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_ID` in the backend `.env`.

---

## Payment Methods Supported

| Method | Swahili Label |
| --- | --- |
| Cash | Pesa Taslimu |
| Bank | Benki |
| M-Pesa (Vodacom) | M-Pesa |
| Tigo Pesa | Tigo Pesa |
| Airtel Money | Airtel Money |
| HaloPesa (CRDB) | HaloPesa |
| Credit | Mkopo |

---

## Roadmap

### Phase 1 — Launched

- [x] Merchant registration + PIN auth
- [x] Product catalog + stock tracking + expiry date
- [x] Low-stock alerts
- [x] POS sales recording with all Tanzanian payment methods
- [x] Profit analytics (daily/weekly/monthly/all-time)
- [x] Wholesale pricing tier (retail / wholesale per product)
- [x] Supplier directory + ordering
- [x] WhatsApp order export (Kiswahili)
- [x] One-tap reorder
- [x] Delivery confirmation + auto stock update
- [x] Supplier portal (PENDING → CONFIRMED → OUT_FOR_DELIVERY)
- [x] Kiswahili/English interface with per-user language preference
- [x] OTP PIN recovery via SMS (Africa's Talking)
- [x] JWT refresh token (1h access + 30d refresh cookie)
- [x] Settings page (shop info, PIN change, language)
- [x] Customer orders + public shop catalog (B2B2C)
- [x] Admin dashboard (users, PIN reset, audit log)
- [x] CSV export (sales + inventory)
- [x] Sentry error tracking (backend + frontend)
- [x] pg_dump database backup script
- [x] Audit trail middleware

### Phase 2 — Next

- [ ] M-Pesa STK push integration (Vodacom Tanzania API)
- [ ] Barcode/QR scanner for stock-in
- [ ] Multi-store support
- [ ] Receipt generation (SMS / PDF)
- [ ] Bulk product import (CSV)
- [ ] Offline mode (PWA with service worker)
- [ ] Supplier route optimisation

### Phase 3 — Scale

- [ ] Working-capital financing (requires BoT microfinance license or licensed partner)
- [ ] Demand forecasting ("order X units based on last 4 weeks")
- [ ] Supplier marketplace (merchants browse supplier catalogs)
- [ ] B2B payment rails between merchants and suppliers
- [ ] Accountant/bookkeeper access role
- [ ] Expansion: Mwanza, Arusha, Mbeya

---

## Tanzania Market Context

- **1,023,520** informal operators in Dar es Salaam (2019 informal sector survey)
- Wholesale/retail is the **largest informal segment**
- Mobile money users and transaction values **growing year-on-year** (Bank of Tanzania, 2024)
- Merchant surcharges on mobile money **prohibited** by Bank of Tanzania
- Digital lending requires BoT microfinance license — DukaOS enters as **software-first**, lending later
- NALA raised **$40M Series A in 2024** — Tanzanian fintech is attracting serious capital

---

## Target Go-to-Market (Month 1–3)

**Wedge:** Mini-groceries and kiosks in Dar es Salaam

**Priority areas:** Kariakoo, Mbagala, Tegeta, Buguruni, Kinondoni

**Acquisition channels:**

- Field reps with in-person demos
- One-page Kiswahili flyer
- WhatsApp onboarding flow
- Merchant referral bonus

**Pricing:**

- Merchants: TZS 20,000–37,500/month (~$8–15)
- Suppliers: TZS 375,000/month (~$150)
- Free setup for first 20 merchants

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes
4. Push: `git push origin feature/your-feature`
5. Open a pull request

---

## License

MIT

---

*DukaOS — Kujenga biashara Tanzania*
