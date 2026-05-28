# DukaOS Testing Guide

## Live URLs

- Frontend: `https://duka-os.vercel.app/`
- Backend API: `https://dukaos-production.up.railway.app/api`
- Health: `https://dukaos-production.up.railway.app/health`
- Status: `https://dukaos-production.up.railway.app/status`

## Test Accounts

- Merchant: `+255700000002` / `1234`
- Test Merchant: `+255700000003` / `1234`
- Supplier: `+255700000001` / `1234`

## Manual Production Smoke Test

1. Open the frontend URL.
2. Log in with the test merchant account.
3. Confirm dashboard loads without API errors.
4. On the dashboard, switch the period filter to `All` and confirm all-time totals render.
5. Confirm the dashboard shows a payment mix section.
6. Confirm the dashboard shows a business history timeline section.
7. Use the language toggle and confirm labels switch between English and Swahili.
8. Refresh the page and confirm the selected language is preserved.
9. Open Inventory and confirm seeded products appear.
10. Open Suppliers and confirm the supplier record appears.
11. Open Sales and add at least one item to the cart.
12. Confirm `Bank` appears as a payment option.
13. Complete a sale using `Bank` and confirm success feedback appears.
14. Open Sales history and confirm the new sale is visible with the correct payment method.
15. Return to Dashboard and confirm recent sales/payment mix update accordingly.
16. Log out.
17. Log in with the supplier account.
18. Confirm the supplier portal loads.

## New Feature Test Checklist (Go-Live Sprint)

### Registration form improvements

1. Open the registration form.
2. Select "Merchant" role.
3. Confirm fields for City/Town, District/Area, and Shop Category are visible.
4. Complete registration with a unique phone number.
5. Log in and go to Settings — confirm the shop location and category are correctly saved.

### Settings page

1. Log in as a merchant.
2. Navigate to Settings (bottom of nav).
3. Update shop name, city, district, and category — click Save.
4. Refresh and confirm the changes persisted.
5. Change the language from Settings and confirm the UI updates immediately.
6. Change PIN: enter current PIN, set a new PIN, confirm new PIN — verify login works with the new PIN.

### Customer Orders view

1. In a browser tab, visit `/catalog` and browse to a shop.
2. Add items to the cart and place a customer order with a test name and phone.
3. Log in as the merchant in another tab.
4. Navigate to Orders → Customer Orders.
5. Confirm the order appears with PENDING status.
6. Click Confirm — confirm a stock deduction alert is shown and stock changes after confirmation.
7. Advance status to OUT_FOR_DELIVERY and then DELIVERED.
8. Try cancelling a PENDING order — confirm stock is NOT deducted for a cancelled PENDING order.
9. Confirm a CONFIRMED order, then cancel it — confirm stock is released back.

### PIN recovery (OTP)

1. On the login screen, click "Forgot PIN?"
2. Enter a registered phone number and submit.
3. In development (no `AT_API_KEY`): check the backend console for the OTP code.
4. Enter the OTP code and a new PIN, submit.
5. Confirm login works with the new PIN.

### Token refresh

1. Log in and note the `dukaos_token` in localStorage (DevTools → Application → Local Storage).
2. Manually set the token to an expired value or wait 1 hour.
3. Make any API request (e.g., visit the dashboard).
4. Confirm the request succeeds without redirecting to login (token was refreshed silently via the `dukaos_refresh` cookie).

### Status endpoint

- Visit `https://dukaos-production.up.railway.app/status`
- Expected response includes `status: "ok"`, `db.status: "ok"`, `db.latencyMs`, `uptimeSeconds`.

### Admin dashboard

1. Log in with an admin account.
2. Navigate to `/admin`.
3. Confirm the Overview tab shows correct user/sale/order counts.
4. Check the Users tab — confirm users list loads.
5. In PIN Reset tab: search for a test user by phone, reset their PIN, confirm login works with the new PIN.
6. Check the Audit Log tab — confirm recent events are displayed.

### Database backup

```bash
cd backend
DATABASE_URL="..." node scripts/backup.js
# Confirm a .sql.gz file appears in ./backups/
```

## Automated Test Layers

### Smoke tests

- `cd backend && npm run smoke:prod`
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

- `cd frontend && npm run smoke`
  - Login page shell loads
  - Manifest is reachable

- `cd frontend && npm run smoke:login`
  - Live login works
  - Merchant dashboard loads
  - Inventory page opens after login
  - Orders page opens after login
  - Customer Orders page opens after login
  - Settings page opens after login
  - Sales page opens after login
  - Logout returns to the login page

### Integration tests

- `cd backend && npm run test:api`
  - Health endpoint returns OK
  - Register validation edge cases reject bad payloads
  - Duplicate registration is rejected
  - Authenticated `/api/auth/me` succeeds
  - Invalid token is rejected
  - Token refresh works
  - Settings endpoints require authentication
  - Customer order status transitions validated
  - Sales, stock, and supplier validation failures are rejected

### E2E tests

- `cd frontend && npm run test:auth`
  - Invalid phone validation state
  - Invalid PIN validation state
  - Invalid credential error state
  - "Forgot PIN" view renders

- `cd frontend && npm run test:e2e`
  - Live login smoke coverage
  - Inventory add, edit, and stock-adjust flows with mocked mutations
  - Supplier portal order status actions with mocked mutations
  - Settings page saves shop details

## Deployment Readiness Checks

- Frontend production build: `npx next build`
- Backend: `npm run start:prod` (runs `prisma migrate deploy` then starts)
- Backend smoke test: `cd backend && npm run smoke:prod`
- Backend integration test: `cd backend && npm run test:api`
- Frontend smoke test: `cd frontend && npm run smoke`
- Frontend Playwright smoke test: `cd frontend && npm run smoke:login`
- Frontend Playwright auth test: `cd frontend && npm run test:auth`
- Frontend Playwright E2E suite: `cd frontend && npm run test:e2e`

## Required Environment Variables for Production

### Backend (Railway)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `JWT_SECRET` | Yes | Long random secret — generate with `crypto.randomBytes(64).toString('hex')` |
| `NODE_ENV` | Yes | Set to `production` |
| `FRONTEND_URL` | Yes | Your Vercel frontend URL for CORS |
| `AT_API_KEY` | Recommended | Africa's Talking API key for OTP SMS |
| `AT_USERNAME` | Recommended | Africa's Talking username (`sandbox` for testing) |
| `SENTRY_DSN` | Optional | Sentry project DSN for error tracking |
| `BACKUP_DIR` | Optional | Directory for pg_dump backups |
| `BACKUP_RETAIN_DAYS` | Optional | Days to keep backups (default: 7) |

### Frontend (Vercel)

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL — no trailing slash or newline |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Sentry DSN for client-side error tracking |

## API Check

- Visit `https://dukaos-production.up.railway.app/health`
- Expected response:

```json
{"status":"ok","service":"DukaOS API"}
```

- Visit `https://dukaos-production.up.railway.app/status`
- Expected response (example):

```json
{
  "status": "ok",
  "service": "DukaOS API",
  "version": "1.0.0",
  "uptimeSeconds": 3600,
  "db": {"status": "ok", "latencyMs": 12},
  "env": "production",
  "timestamp": "2026-05-28T09:00:00.000Z"
}
```

## Release Recommendation

- Run smoke tests on every deployment.
- Run backend integration tests whenever auth, validation, or route middleware changes.
- Run the Playwright E2E suite whenever inventory, orders, supplier portal, or auth UX changes.
- After each deploy, manually verify the Settings page saves correctly and the Customer Orders view loads.
