# Request Timeout Diagnostics

DukaPilot sends a UUID in `X-Request-ID` for API calls. The API echoes that ID and logs a structured `api_request_timing` event for:

- `GET /api/auth/me`
- `GET /api/dashboard` and its dashboard subroutes
- `POST /api/products`
- `POST /api/cash-sessions/open`

Frontend API errors include the same ID in Sentry's `api_request` context. Search Railway production logs for `api_request_timing`, then match the `requestId` from Sentry. Each event includes the method, route, HTTP status, total backend duration, completion outcome, and safe phase timings. It does not include request bodies, shop IDs, product names, prices, customer data, or authentication material.

Useful phase names include:

- `/auth/me`: `auth.accountLookup`, `auth.staffLookup`, `auth.profileLookup`, and `auth.branchProfileLookup`
- Dashboard: `dashboard.shopResolution`, `dashboard.baseReads`, `dashboard.dailyChart`, `dashboard.productAndPaymentRankings`, `dashboard.historicalCache`, and `dashboard.financialAggregates`
- Product creation: `product.shopResolution`, `product.idempotencyPrecheck`, `product.supplierLookup`, `product.barcodeSkuChecks`, `product.insert`, `product.openingStockMovement`, and `product.transaction`
- Shift opening: `shop_lock`, `idempotency_lookup`, `open_session_lookup`, `actor_lookup`, `session_create`, `summary`, and `transaction`

An `outcome` of `client_disconnected` means the API connection closed before Express finished its response. If Sentry reports a timeout but no matching Railway event appears, check whether the request reached the Railway service and inspect the Vercel rewrite/function logs for the same time window. A fast backend duration with a slow browser request points toward the proxy or network path; a slow phase points to the corresponding backend/database operation.

## Uncertain Product Saves

When product creation times out or loses its response, the browser keeps the exact request body and idempotency key in tab-scoped `sessionStorage`, scoped to the signed-in user or staff member and active branch. Reloading the same tab restores the pending form in a locked state. Retrying it uses the original body and key, so the backend returns the existing product or safely completes the original create. A confirmed save or definitive client error clears the pending record. Closing the tab clears session storage; this recovery is not shared across tabs or devices.

Shift opening uses the same recovery principle. The browser retains the opening cash, optional note, branch, and retry key in tab-scoped `sessionStorage` for up to 24 hours. Repeating that request returns the same open session; changing its details under the same key is rejected. The backend locks the shop row while checking for an existing actor shift and inserting a new one, preventing simultaneous opens from creating duplicate open drawers. The key and its request hash are stripped from every API response. Logout, authentication failure, branch switching, confirmation, and definitive client errors clear the pending request.

For an `INVALID_RESPONSE` Sentry event, the frontend also records the response content type and Vercel edge request ID when those response headers are available. These identify the proxy response without recording its body. Match the edge request ID in Vercel logs and the `requestId` in Railway logs; a network timeout may have no response headers and therefore no edge ID.

Safe GETs and keyed idempotent writes retry an `INVALID_RESPONSE`, HTTP 502/503/504, or `ROUTER_EXTERNAL_TARGET_ERROR` once. A persistent malformed or proxy response is still reported with the response metadata for correlation.

The recovery record contains only the pending product form and request body, not authentication tokens. It is removed after confirmation. Do not use this mechanism as a substitute for resolving a persistent slow database or proxy path.
