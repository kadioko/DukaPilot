# Request Timeout Diagnostics

DukaPilot sends a UUID in `X-Request-ID` for API calls. The API echoes that ID and logs a structured `api_request_timing` event for:

- `GET /api/auth/me`
- `GET /api/dashboard` and its dashboard subroutes
- `POST /api/products`

Frontend API errors include the same ID in Sentry's `api_request` context. Search Railway production logs for `api_request_timing`, then match the `requestId` from Sentry. Each event includes the method, route, HTTP status, total backend duration, completion outcome, and safe phase timings. It does not include request bodies, shop IDs, product names, prices, customer data, or authentication material.

Useful phase names include:

- `/auth/me`: `auth.accountLookup`, `auth.staffLookup`, `auth.profileLookup`, and `auth.branchProfileLookup`
- Dashboard: `dashboard.shopResolution`, `dashboard.baseReads`, `dashboard.dailyChart`, `dashboard.productAndPaymentRankings`, `dashboard.historicalCache`, and `dashboard.financialAggregates`
- Product creation: `product.shopResolution`, `product.idempotencyPrecheck`, `product.supplierLookup`, `product.barcodeSkuChecks`, `product.insert`, `product.openingStockMovement`, and `product.transaction`

An `outcome` of `client_disconnected` means the API connection closed before Express finished its response. If Sentry reports a timeout but no matching Railway event appears, check whether the request reached the Railway service and inspect the Vercel rewrite/function logs for the same time window. A fast backend duration with a slow browser request points toward the proxy or network path; a slow phase points to the corresponding backend/database operation.

## Uncertain Product Saves

When product creation times out or loses its response, the browser keeps the exact request body and idempotency key in tab-scoped `sessionStorage`, scoped to the signed-in user or staff member and active branch. Reloading the same tab restores the pending form in a locked state. Retrying it uses the original body and key, so the backend returns the existing product or safely completes the original create. A confirmed save or definitive client error clears the pending record. Closing the tab clears session storage; this recovery is not shared across tabs or devices.

The recovery record contains only the pending product form and request body, not authentication tokens. It is removed after confirmation. Do not use this mechanism as a substitute for resolving a persistent slow database or proxy path.
