# DukaPilot Testing Guide

## Safe Automated Commands

Run local unit tests without touching production authentication:

```bash
cd backend
npm test
```

Production checks are deliberately separate because they use a real demo login and consume rate-limit allowance:

```bash
cd backend
npm run monitor:prod
```

Do not run `npm run test:prod-api`, `npm run smoke:prod`, and `npm run monitor:prod` repeatedly in the same 15-minute window.

Frontend verification:

```bash
cd frontend
npm run typecheck
npm run test:mocked
npm run test:a11y
npm run build
```

## Migration Gate

Railway must apply `20260710001000_launch_hardening` before the matching frontend is considered fully deployed. Verify:

- staff phone identities are unique;
- staff language is stored per staff member;
- payment references and billing report IDs are idempotent;
- demo/QA shops are hidden from the public marketplace;
- catalog publishing can be changed from Settings.

## High-Risk Regression Checks

1. Deactivate a cashier, then confirm the existing session receives `401 Staff access expired` on its next request.
2. Downgrade a staff permission and confirm it takes effect without waiting for token expiry.
3. Confirm a customer order cannot move from `PENDING` directly to `DELIVERED`.
4. Confirm two confirmation attempts cannot reserve stock twice or push stock negative.
5. Confirm the same payment reference cannot extend a subscription twice.
6. Confirm Basic hides staff and AI while Pro enables both; an active trial enables both.
7. Confirm Settings changes a staff member's own name, PIN, and language without changing the owner.
8. Confirm `/orders`, `/inventory`, and `/sales` have no horizontal page overflow at 390px width.
9. Confirm the public catalog excludes demo/QA shops and loads additional products with the Load More button.
10. Confirm Android does not request notification permission in release `1.0.2`.

## Live URLs

| | URL |
| --- | --- |
| Frontend | [https://www.dukapilot.com/](https://www.dukapilot.com/) |
| Backend API | [https://dukapilotproduction.up.railway.app/api](https://dukapilotproduction.up.railway.app/api) |
| Health | [https://dukapilotproduction.up.railway.app/health](https://dukapilotproduction.up.railway.app/health) |
| Status | [https://dukapilotproduction.up.railway.app/status](https://dukapilotproduction.up.railway.app/status) |
| Email | Mailtrap outbound + ImprovMX inbound forwarding |

---

## Test Accounts

Merchant and supplier demo PINs: `1234`. Admin credentials are intentionally not documented here.

| Role | Phone | Name / Shop | Key purpose |
| --- | --- | --- | --- |
| **Merchant** | **+255700000002** | **Mama Amina / Duka la Amina** | **FEATURED — every scenario (see below)** |
| Merchant | +255700000003 | Bwana Salum / Salum Pharmacy | Pharmacy, Kinondoni — orders in Jumla supplier portal |
| Merchant | +255700000004 | Hassan Juma / Hassan Bar & Wines | Bar, wholesale sales, bar category |
| Merchant | +255700000005 | Fatuma Ally / Fatuma Beauty Shop | Beauty, online channel, out-of-stock scenario |
| **Supplier** | **+255700000001** | **Jumla Traders Ltd** | **FEATURED — every order status in portal** |
| Supplier | +255700000006 | Rafiki Beverages Ltd | Hassan's beverage supplier |
| Supplier | +255700000007 | Beauty Supplies TZ | Fatuma's cosmetics supplier |

---

## Featured Accounts — All Scenarios Reference

Use these two accounts when you need to demonstrate or test any specific feature. Every state the app can be in is pre-seeded here.

### Mama Amina — Duka la Amina (`+255700000002`)

Grocery shop, Mbagala, Temeke. Language: Kiswahili.

#### Products (12 — every stock/expiry scenario)

| Product | Scenario |
| --- | --- |
| Unga wa Sembe (2kg) | Good stock (30) · wholesale price set · `doesNotExpire: true` |
| Mchele (1kg) | **LOW STOCK** — 4 in stock, minimum 10 · wholesale price set |
| Mafuta ya Kupikia (1L) | Good stock (12) · expiry 6 months out · no wholesale |
| Sukari (1kg) | **LOW STOCK** — 3 in stock, minimum 8 · wholesale price set |
| Sabuni ya Kufulia | Good stock (25) · `doesNotExpire: true` · no wholesale |
| Chumvi (500g) | Good stock (20) · `doesNotExpire: true` · no wholesale |
| Maziwa Freshi (500ml) | **EXPIRING SOON** — expires in 14 days |
| Soda (Fanta 300ml) | Good stock (48) · wholesale price set (min qty 24) |
| Mayai (tray 30) | Good stock (10) · wholesale price set · `doesNotExpire: true` edge case |
| Nyanya (kg) | **URGENT EXPIRY** — expires in 5 days (fresh produce) |
| Uji wa Mtoto (500g) | **OUT OF STOCK** (0) · minimum 10 — zero-stock alert |
| Siagi (Blue Band 250g) | Good stock (18) · **HIGH MARGIN** — buy 2,000 / sell 4,200 (110%) |

#### Sales (10 — all payment methods, both pricing tiers, both channels)

| Day | Payment method | Pricing tier | Channel | Notes |
| --- | --- | --- | --- | --- |
| 13 days ago | CASH | RETAIL | POS | Single-item sale |
| 10 days ago | BANK | WHOLESALE | POS | Multi-item bulk buyer |
| 8 days ago | CREDIT | RETAIL | POS | Credit sale scenario |
| 6 days ago | CASH | RETAIL | POS | Multi-item |
| 5 days ago | MPESA | RETAIL | POS | M-Pesa mobile money |
| 4 days ago | TIGOPESA | RETAIL | POS | Tigo Pesa mobile money |
| 3 days ago | AIRTEL_MONEY | RETAIL | ONLINE | Airtel Money · online channel |
| 2 days ago | HALOPESA | RETAIL | POS | HaloPesa (CRDB) |
| Yesterday | BANK | WHOLESALE | POS | Second wholesale sale |
| Today | MPESA | RETAIL | ONLINE | Online + high-margin product |

#### Supplier Orders → Jumla Traders (all 5 statuses)

| Status | Items | Notes |
| --- | --- | --- |
| **PENDING** | Rice (20kg) + Sugar (10kg) | Created today — low-stock items needing reorder |
| **CONFIRMED** | Flour (20 bags) + Soda (24 pcs) | Jumla confirmed 2 days ago, awaiting dispatch |
| **OUT_FOR_DELIVERY** | Cooking oil (10L) + Salt (30 pkt) | Driver on the way, created 4 days ago |
| **DELIVERED** | Soap (15 bars) + Baby porridge (10 pkt) | Received 9 days ago — stock IN movements recorded |
| **CANCELLED** | Tomatoes (15kg) | Cancelled 14 days ago — supplier couldn't supply |

#### Customer Orders — Inbound (all 5 statuses + an extra CONFIRMED)

| Status | Customer | Items | Notes |
| --- | --- | --- | --- |
| **PENDING** | Ali Hassan | Flour (2 bags) + Salt (4 pkt) | New today, not yet reviewed |
| **CONFIRMED** | John Mwangi | Flour (2 bags) + Cooking oil (1L) | Accepted, stock reserved |
| **CONFIRMED** | Neema Shaban | Eggs (2 trays) + Tomatoes (3kg) | Fresh produce delivery |
| **OUT_FOR_DELIVERY** | Grace Mwacha | Milk (4 pcs) + Soap (9 bars) | Driver picked up 2 days ago |
| **DELIVERED** | Jumanne Kipanga | Flour (10 bags) + Soda (24 pcs) — **WHOLESALE** | Completed 5 days ago |
| **CANCELLED** | Said Othman | Rice (3kg) | Cancelled 7 days ago — customer changed mind |

#### Stock Movements (manual IN · OUT · ADJUSTMENT)

| Type | Product | Notes |
| --- | --- | --- |
| **IN** | Soap | 5 bars returned from a cancelled order (reshelved) |
| **IN** | Soap + Baby porridge | Auto-recorded when DELIVERED supplier order was received |
| **OUT** | Milk | 3 pcs sold at counter without POS (manual record) |
| **ADJUSTMENT** | Flour | Stocktake found 2 bags more than recorded — corrected to 32 |

---

### Jumla Traders Ltd — Supplier Portal (`+255700000001`)

Supplies both Amina (grocery) and Salum (pharmacy). Every order status is visible in the portal.

#### Orders visible in supplier portal

| From | Status | Items |
| --- | --- | --- |
| Duka la Amina | **PENDING** | Rice + Sugar |
| Duka la Amina | **CONFIRMED** | Flour + Soda |
| Duka la Amina | **OUT_FOR_DELIVERY** | Cooking oil + Salt |
| Duka la Amina | **DELIVERED** | Soap + Baby porridge |
| Duka la Amina | **CANCELLED** | Tomatoes |
| Salum Pharmacy | **CONFIRMED** | Panadol + ORS |
| Salum Pharmacy | **OUT_FOR_DELIVERY** | Vitamin C |

The supplier portal allows Jumla to:

- View all incoming orders grouped by status
- Advance PENDING → CONFIRMED → OUT_FOR_DELIVERY
- See which merchant ordered and their location
- View the dashboard with order counts by status and top merchants

---

## Manual Production Smoke Test

1. Open the frontend URL.
2. Log in with `+255700000002` / `1234` (Mama Amina).
3. Confirm the dashboard loads — check today / week / month / all filters.
4. Confirm low-stock alerts appear (Mchele, Sukari, Uji wa Mtoto).
5. Confirm the dashboard shows payment mix and business history timeline.
6. Use the language toggle and confirm labels switch between English and Swahili.
7. Refresh the page and confirm language is preserved.
8. Open Inventory — confirm 12 products appear with correct stock badges (low/out/expiring).
9. Open Sales — record a CASH sale, confirm stock decrements.
10. Open Orders — confirm all 5 supplier order statuses are visible.
11. Open Orders → Customer Orders — confirm all 6 customer order statuses are visible.
12. Log out.
13. Log in with `+255700000001` / `1234` (Jumla Traders).
14. Confirm the supplier portal loads — confirm 7 orders from 2 merchants are visible.
15. Confirm PENDING → CONFIRMED status update works.
16. Log out.
17. Log in with the secure admin credentials.
18. Navigate to `/admin` — confirm overview stats, users list, audit log all load.
19. Log out.

---

## Feature Test Checklists

### Dashboard scenarios (use Mama Amina `+255700000002`)

1. Log in and open the dashboard.
2. Switch between Today / Week / Month / All filters — confirm totals change correctly.
3. Confirm the payment mix chart shows at least: CASH, MPESA, BANK, TIGOPESA, HALOPESA, AIRTEL_MONEY, CREDIT.
4. Confirm the business history timeline shows entries going back 13+ days.
5. Confirm the low-stock alert panel lists: Mchele, Sukari, Uji wa Mtoto (out of stock).
6. Confirm the expiry warning shows: Nyanya (5 days), Maziwa Freshi (14 days).
7. Confirm the pending orders count includes at least 3 active supplier orders (PENDING + CONFIRMED + OUT_FOR_DELIVERY).

### Inventory — all product scenarios (use Mama Amina)

1. Open Inventory.
2. Confirm Uji wa Mtoto shows as **out of stock** (red badge, 0).
3. Confirm Mchele and Sukari show as **low stock** badges.
4. Confirm Nyanya shows an **urgent expiry** indicator.
5. Confirm Maziwa Freshi shows an **expiring soon** indicator.
6. Confirm Siagi shows a high margin (110%).
7. Click stock adjustment on Unga wa Sembe — set an ADJUSTMENT to a new value, confirm it saves and a StockMovement record is created.
8. Check the stock movement history for Unga — confirm ADJUSTMENT entry appears alongside earlier IN/OUT movements.

### Sales — all payment methods (use Mama Amina)

Record one sale for each payment method and confirm it appears in history:

- CASH
- MPESA
- TIGOPESA
- AIRTEL_MONEY
- HALOPESA
- BANK
- CREDIT

Then record a WHOLESALE sale (select Wholesale pricing tier) and confirm the discounted price is applied.

### Supplier orders — all statuses (use Mama Amina + Jumla Traders)

1. Log in as Amina and open Orders.
2. Confirm all 5 statuses are visible: PENDING, CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED.
3. Open the PENDING order — confirm the WhatsApp message is generated.
4. Log out and log in as Jumla Traders (`+255700000001`).
5. Open the supplier portal — confirm the PENDING order from Amina appears.
6. Advance it to CONFIRMED — confirm status updates for both supplier and merchant.
7. Advance to OUT_FOR_DELIVERY.
8. Log back in as Amina — find the OUT_FOR_DELIVERY order and click Confirm Delivery.
9. Confirm the order moves to DELIVERED and stock is incremented.
10. Create a new order from Amina — then cancel it. Confirm status shows CANCELLED.
11. Use the reorder button on the DELIVERED order — confirm a new PENDING order is created.

### Customer orders — all statuses (use Mama Amina)

1. Open Orders → Customer Orders.
2. Confirm all 6 statuses are visible: PENDING, CONFIRMED (×2), OUT_FOR_DELIVERY, DELIVERED, CANCELLED.
3. Open the PENDING order from Ali Hassan — confirm and verify stock deducts.
4. Advance to OUT_FOR_DELIVERY, then DELIVERED.
5. Open the CANCELLED order — confirm it is read-only.
6. Visit the public catalog (`/catalog`) in a separate tab, place a new order.
7. Return to Customer Orders — confirm the new PENDING order appears.

### Stock movements — IN / OUT / ADJUSTMENT (use Mama Amina)

1. Open Inventory → select Unga wa Sembe.
2. View stock movement history — confirm IN movement from the DELIVERED supplier order is present.
3. Confirm ADJUSTMENT and manual OUT movements are also listed.
4. Do a manual ADJUSTMENT — verify new movement entry appears.

### Supplier portal — all scenarios (use Jumla Traders `+255700000001`)

1. Log in as Jumla Traders.
2. Confirm orders from **two different merchants** (Amina and Salum) are visible.
3. Confirm orders in all statuses are shown: PENDING, CONFIRMED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED.
4. Advance one PENDING order to CONFIRMED. Confirm the merchant sees the update.
5. Check the dashboard tab — confirm order count by status and top-merchant list.

### Registration form

1. Open the registration form.
2. Select "Merchant" role.
3. Confirm fields for City/Town, District/Area, and Shop Category are visible.
4. Complete registration with a unique phone number.
5. Log in and navigate to Settings — confirm shop details are correctly saved.

### Settings page

1. Log in as any merchant.
2. Navigate to Settings (bottom of nav).
3. Update shop name, city, district, and category — click Save.
4. Refresh and confirm the changes persisted.
5. Change language — confirm the UI updates immediately.
6. Change PIN — enter current PIN, set a new PIN, verify login with new PIN.

### Debts, expenses, staff, and assistant

1. Log in as Mama Amina (`+255700000002` / `1234`).
2. Open `/debts` — confirm existing credit-sale debt totals load. Add a small manual debt, then mark it paid.
3. Open `/expenses` — add a test expense with category `OTHER`; confirm the total updates.
4. Open `/staff` — add a cashier, toggle at least one permission, and confirm the active/inactive button works.
5. Add a staff phone and PIN, then log out and confirm the staff member can log in with that phone/PIN.
6. Confirm cashier permissions allow `/sales` but block stock/report/staff routes when those permissions are off.
7. Open `/assistant` — confirm recommendations rank named stock, debt, expense, top-product, or pending-order actions when those records exist.
8. Click assistant action links and confirm they open the relevant workflow, including inventory search when a product is named.
9. Switch language between Kiswahili and English and confirm all four pages update their labels.

### Subscription and payment admin

1. Log in with the secure admin credentials and open `/admin`.
2. Open Subscriptions and confirm active/trial/expired/suspended filters work.
3. Use `Paid Basic` or `Paid Pro` on a test shop and confirm the plan, status, and last payment update.
4. Suspend a test shop and confirm write actions return a subscription-required message while read-only views still load.
5. Search for a staff phone in PIN Reset and confirm staff PIN reset works.

### Offline sales queue

1. Log in as a merchant and open `/sales`.
2. Simulate offline mode in browser dev tools or disconnect the network.
3. Add items and complete a sale.
4. Confirm the pending-sync badge appears and the cart clears.
5. Restore network and confirm the pending sale syncs, then products refresh.

### Onboarding and public trust pages

1. Register a new merchant and confirm the app routes to `/onboarding`.
2. Confirm onboarding links open Settings, Inventory, Sales, Catalog, and Pricing.
3. Open `/contact`, `/help`, and `/demo`; confirm English/Swahili switching works and WhatsApp uses `+255743910580`.
4. Open `/catalog`, search for a product that does not exist, and confirm the polished empty state explains catalog sharing and shows demo shop links when shops exist.

### PIN recovery (OTP)

1. On the login screen, click "Forgot PIN?"
2. Enter a registered phone number and submit.
3. In development (no `AT_API_KEY`): check the backend console for the OTP code.
4. Enter the OTP code and a new PIN, submit.
5. Confirm login works with the new PIN.

### Token refresh

1. Log in and note the `dukapilot_token` in localStorage.
2. Manually set the token to an expired value.
3. Make any API request — confirm it succeeds (token refreshed silently via `dukapilot_refresh` cookie).

### Status endpoint

Visit `https://dukapilotproduction.up.railway.app/status`. Expected:

```json
{
  "status": "ok",
  "service": "DukaPilot API",
  "version": "1.0.0",
  "uptimeSeconds": 3600,
  "db": { "status": "ok", "latencyMs": 12 },
  "env": "production",
  "timestamp": "2026-05-28T09:00:00.000Z"
}
```

### Admin dashboard

1. Log in with the secure admin credentials.
2. Navigate to `/admin`.
3. Overview tab — confirm user/sale/order counts are non-zero.
4. Users tab — confirm 8 users (1 admin + 4 merchants + 3 suppliers) appear.
5. PIN Reset tab — search for `+255700000002`, reset PIN, confirm login works with new PIN.
6. Audit Log tab — confirm recent events are displayed.

### Database backup

```bash
cd backend
DATABASE_URL="..." node scripts/backup.js
# Confirm a .sql.gz file appears in ./backups/
```

---

## Automated Test Layers

### Smoke tests

**Backend:**

```bash
cd backend && npm run smoke:prod
```

Covers:

- Healthcheck success
- Status endpoint success
- Valid login success
- Authenticated `/api/auth/me` success
- Invalid token returns `401`
- Token refresh returns new token
- Invalid auth payload returns `400`
- Invalid sales payload returns `400`
- Invalid stock payload returns `400`
- Invalid supplier payload returns `400`
- Public catalog endpoints return products

**Frontend:**

```bash
cd frontend && npm run smoke
```

Covers:

- Login page shell loads
- Manifest is reachable

**Frontend Playwright browser smoke:**

```bash
cd frontend && npm run smoke:login
```

Covers:

- Live login works
- Merchant dashboard loads
- Inventory page opens after login
- Orders page opens after login
- Customer Orders page opens after login
- Settings page opens after login
- Sales page opens after login
- Debts, Expenses, Staff, and Assistant pages open after login
- Logout returns to the login page

### Integration tests

```bash
cd backend && npm run test:api
```

Covers:

- Health endpoint returns OK
- Register validation edge cases reject bad payloads
- Duplicate registration is rejected
- Authenticated `/api/auth/me` succeeds
- Invalid token is rejected
- Token refresh works
- Settings endpoints require authentication
- Customer order status transitions validated
- Sales, stock, and supplier validation failures are rejected

### E2E / Playwright tests

```bash
cd frontend && npm run test:auth         # Auth negative-path flows
cd frontend && npm run test:inventory    # Inventory flows (mocked)
cd frontend && npm run test:supplier     # Supplier portal flows (mocked)
cd frontend && npm run test:mocked       # All mocked flows together
cd frontend && npm run test:a11y         # Accessibility checks
cd frontend && npm run test:e2e          # Full suite
```

### TypeScript typecheck

```bash
cd frontend && npm run typecheck
```

---

## Deployment Readiness Checks

Run these in order before each production release:

1. `cd backend && npm run smoke:prod` — production API smoke
2. `cd backend && npm run test:api` — integration tests
3. `cd frontend && npm run typecheck` — TypeScript type check
4. `cd frontend && npm run smoke` — frontend page load
5. `cd frontend && npm run smoke:login` — Playwright browser login flow
6. `cd backend && npm run email:dns-check` — Mailtrap/ImprovMX DNS
7. `cd frontend && npm run test:auth` — auth negative paths
8. `cd frontend && npm run test:e2e` — full Playwright suite

Manual post-deploy checks:

- Featured merchant (`+255700000002`) dashboard loads with all period filters
- Low-stock and out-of-stock alerts visible in inventory
- All 5 supplier order statuses visible in Orders
- All customer order statuses visible in Customer Orders
- Supplier portal (`+255700000001`) shows orders from multiple merchants
- Language toggle persists after hard refresh
- Settings page saves correctly
- Debt, expense, staff, and assistant pages load for merchants
- Staff permission enforcement blocks restricted staff sessions from stock, reports, staff management, and settings profile changes
- Subscription payment actions, suspension, and mutation enforcement work from Admin
- Offline sales queue syncs after connection returns
- `/contact`, `/help`, `/demo`, and `/onboarding` render without console errors
- `/catalog` empty/search state shows merchant education, demo shops, and WhatsApp/register CTAs

Current sprint checks:

- New merchant registration creates a shop with a 14-day free trial visible from `/subscription/status`.
- `/billing` shows subscription status, M-Pesa instructions, WhatsApp support, and lets the merchant submit a payment reference as a `BILLING` report.
- Admin `/admin` overview shows Business Operations metrics: active shops, trials, expiring trials, unpaid, suspended, support issues, billing requests, and suspicious errors.
- Admin can review `BILLING` reports, then use Subscriptions to mark Paid Basic/Pro and confirm Last Payment updates.
- `/assistant` shows a daily command list, why-it-matters notes, expected impact, direct action buttons, and a WhatsApp-style owner summary.
- `/assistant/history` shows merchant AI actions and their opened/completed/dismissed status.
- Admin `/admin` shows assistant analytics without blanking the dashboard if an optional analytics endpoint fails.
- Offline sales show queued/synced/failed sync history. Stock conflicts should leave the sale pending with a visible retry error.
- Admin sync support shows failed syncs by shop/device, allows device labels, and supports Open/Contacted/Resolved resolution status.
- Concurrent sale attempts for the last stock units should never leave product stock below zero.
- `/onboarding` includes Settings, Inventory, Staff, Sales, Catalog, and Pricing/Billing actions, with checklist progress saved locally.
- `/pricing`, `/contact`, `/help`, and `/demo` explain payment/support clearly and keep WhatsApp `+255743910580` visible.

---

## Required Environment Variables for Production

### Backend (Railway)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Private PostgreSQL connection URL |
| `DATABASE_MIGRATE_URL` | Yes | Public TCP proxy URL for `prisma migrate deploy` at startup |
| `JWT_SECRET` | Yes | Long random secret — generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `NODE_ENV` | Yes | Set to `production` |
| `FRONTEND_URL` | Yes | Official frontend URL for CORS (`https://www.dukapilot.com`) |
| `AT_API_KEY` | Recommended | Africa's Talking API key for OTP SMS |
| `AT_USERNAME` | Recommended | Africa's Talking username (`sandbox` for testing) |
| `AT_SENDER_ID` | Optional | Custom SMS sender ID |
| `MAIL_FROM` | Optional | Outbound sender, for example `DukaPilot <noreply@dukapilot.com>` |
| `MAIL_REPLY_TO` | Optional | Reply-to address, usually `support@dukapilot.com` |
| `MAILTRAP_API_TOKEN` | Optional | Mailtrap Email API token for outbound email |
| `MAILTRAP_SMTP_HOST` | Optional | Mailtrap SMTP host, usually `live.smtp.mailtrap.io` |
| `MAILTRAP_SMTP_PORT` | Optional | Mailtrap SMTP port, usually `587` |
| `MAILTRAP_SMTP_USER` | Optional | Mailtrap SMTP username |
| `MAILTRAP_SMTP_PASS` | Optional | Mailtrap SMTP password |

### Production monitor

Run:

```bash
cd backend
npm run monitor:prod
```

This checks backend health, frontend shell, public catalog/API loading, CORS preflight for the Vercel origin, login, authenticated dashboard access, controlled 401 handling, and stale old Railway API URL leakage.
| `SENTRY_DSN` | Optional | Sentry project DSN for error tracking |
| `WHATSAPP_API_URL` | Optional | WhatsApp Cloud API URL |
| `WHATSAPP_API_TOKEN` | Optional | WhatsApp Cloud API token |
| `WHATSAPP_PHONE_ID` | Optional | WhatsApp Business phone number ID |
| `BACKUP_DIR` | Optional | Directory for pg_dump backups (default: `./backups`) |
| `BACKUP_RETAIN_DAYS` | Optional | Days to keep backups (default: `7`) |

### Frontend (Vercel)

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Yes | `https://dukapilotproduction.up.railway.app/api` — no trailing slash or newline |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Sentry DSN for client-side error tracking |
| `SENTRY_DSN` | Optional | Sentry DSN for server-side (SSR) error tracking |

---

## API Quick Reference

```text
GET /health  →  {"status":"ok","service":"DukaPilot API"}
GET /status  →  {"status":"ok","db":{"status":"ok","latencyMs":N},...}
```

For the full API surface see the **API Reference** section in `README.md`.

---

## Seeding

```bash
cd backend
DATABASE_MIGRATE_URL="postgresql://postgres:...@trolley.proxy.rlwy.net:PORT/railway" node prisma/seed.js
```

The seed is idempotent — safe to run multiple times. It uses `upsert` for all users, shops, suppliers, and products (keyed by phone or fixed ID). Sales, orders, and stock movements are appended on each run; wipe those tables first if you want a clean slate.
