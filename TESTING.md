# DukaOS Testing Guide

## Live URLs

| | URL |
| --- | --- |
| Frontend | https://duka-os.vercel.app/ |
| Backend API | https://dukaos-production.up.railway.app/api |
| Health | https://dukaos-production.up.railway.app/health |
| Status | https://dukaos-production.up.railway.app/status |

---

## Test Accounts

All PINs: `1234`

| Role | Phone | Name / Shop |
| --- | --- | --- |
| Admin | +255700000000 | Admin DukaOS |
| Merchant | +255700000002 | Mama Amina / Duka la Amina (grocery, Temeke) |
| Test Merchant | +255700000003 | Salum / Salum Pharmacy (Kinondoni) |
| Supplier | +255700000001 | Jumla Traders Ltd (Kariakoo) |

---

## Manual Production Smoke Test

1. Open the frontend URL.
2. Log in with the test merchant account (`+255700000002` / `1234`).
3. Confirm the dashboard loads without API errors.
4. Switch the period filter to `All` and confirm all-time totals render.
5. Confirm the dashboard shows a payment mix section and a business history timeline.
6. Use the language toggle and confirm labels switch between English and Swahili.
7. Refresh the page and confirm the selected language is preserved.
8. Open Inventory and confirm seeded products appear.
9. Open Suppliers and confirm the supplier record appears.
10. Open Sales, add at least one item to the cart, confirm `Bank` appears as a payment option.
11. Complete a sale using `Bank` and confirm success feedback appears.
12. Open Sales history and confirm the new sale is visible with the correct payment method.
13. Return to Dashboard and confirm recent sales/payment mix updated.
14. Log out.
15. Log in with the supplier account (`+255700000001` / `1234`).
16. Confirm the supplier portal loads with any pending orders.
17. Log out.
18. Log in with the admin account (`+255700000000` / `1234`).
19. Navigate to `/admin` and confirm the overview stats load.
20. Log out.

---

## Feature Test Checklists

### Registration form

1. Open the registration form.
2. Select "Merchant" role.
3. Confirm fields for City/Town, District/Area, and Shop Category are visible.
4. Complete registration with a unique phone number.
5. Log in and navigate to Settings — confirm shop location and category are correctly saved.

### Settings page

1. Log in as a merchant.
2. Navigate to Settings (bottom of nav).
3. Update shop name, city, district, and category — click Save.
4. Refresh and confirm the changes persisted.
5. Change the language from Settings and confirm the UI updates immediately.
6. Change PIN: enter current PIN, set a new PIN, confirm new PIN.
7. Log out and confirm login works with the new PIN.

### Customer Orders view

1. In a browser tab, visit `/catalog` and browse to a shop.
2. Add items to the cart and place a customer order with a test name and phone.
3. Log in as the merchant in another tab.
4. Navigate to Orders → Customer Orders.
5. Confirm the order appears with PENDING status.
6. Click Confirm — confirm stock deduction occurs.
7. Advance status to OUT_FOR_DELIVERY and then DELIVERED.
8. Test cancellation: cancel a PENDING order and confirm stock is NOT affected.
9. Confirm a second order, then cancel it — confirm stock is released back.

### PIN recovery (OTP)

1. On the login screen, click "Forgot PIN?"
2. Enter a registered phone number and submit.
3. In development (no `AT_API_KEY`): check the backend console for the OTP code.
4. Enter the OTP code and a new PIN, submit.
5. Confirm login works with the new PIN.

### Token refresh

1. Log in and note the `dukaos_token` in localStorage (DevTools → Application → Local Storage).
2. Manually set the token to an expired value.
3. Make any API request (e.g., visit the dashboard).
4. Confirm the request succeeds without redirecting to login (token was refreshed silently via the `dukaos_refresh` cookie).

### Status endpoint

Visit `https://dukaos-production.up.railway.app/status`. Expected response:

```json
{
  "status": "ok",
  "service": "DukaOS API",
  "version": "1.0.0",
  "uptimeSeconds": 3600,
  "db": { "status": "ok", "latencyMs": 12 },
  "env": "production",
  "timestamp": "2026-05-28T09:00:00.000Z"
}
```

### Admin dashboard

1. Log in with the admin account (`+255700000000` / `1234`).
2. Navigate to `/admin`.
3. Overview tab — confirm user/sale/order counts are non-zero.
4. Users tab — confirm users list loads.
5. PIN Reset tab — search for a test user by phone, reset their PIN, confirm login works with the new PIN.
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
6. `cd frontend && npm run test:auth` — auth negative paths
7. `cd frontend && npm run test:e2e` — full Playwright suite

Manual post-deploy checks:
- Settings page saves correctly
- Customer Orders view loads
- Language toggle persists after hard refresh
- Supplier portal loads and shows correct orders

---

## Required Environment Variables for Production

### Backend (Railway)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Private PostgreSQL connection URL |
| `DATABASE_MIGRATE_URL` | Yes | Public TCP proxy URL for `prisma migrate deploy` at startup |
| `JWT_SECRET` | Yes | Long random secret — generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `NODE_ENV` | Yes | Set to `production` |
| `FRONTEND_URL` | Yes | Vercel frontend URL for CORS |
| `AT_API_KEY` | Recommended | Africa's Talking API key for OTP SMS |
| `AT_USERNAME` | Recommended | Africa's Talking username (`sandbox` for testing) |
| `AT_SENDER_ID` | Optional | Custom SMS sender ID |
| `SENTRY_DSN` | Optional | Sentry project DSN for server-side error tracking |
| `WHATSAPP_API_URL` | Optional | WhatsApp Cloud API URL |
| `WHATSAPP_API_TOKEN` | Optional | WhatsApp Cloud API token |
| `WHATSAPP_PHONE_ID` | Optional | WhatsApp Business phone number ID |
| `BACKUP_DIR` | Optional | Directory for pg_dump backups (default: `./backups`) |
| `BACKUP_RETAIN_DAYS` | Optional | Days to keep backups (default: `7`) |

### Frontend (Vercel)

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL — no trailing slash or newline |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Sentry DSN for client-side error tracking |
| `SENTRY_DSN` | Optional | Sentry DSN for server-side (SSR) error tracking |

---

## API Quick Reference

```text
GET /health  →  {"status":"ok","service":"DukaOS API"}
GET /status  →  {"status":"ok","db":{"status":"ok","latencyMs":N},...}
```

For the full API surface see the **API Reference** section in `README.md`.
