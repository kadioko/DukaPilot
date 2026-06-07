# DukaPilot Load Tests

Uses [k6](https://k6.io/) — an open-source load testing tool.

## Install k6

```bash
# macOS
brew install k6

# Windows (Chocolatey)
choco install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Run against production

```bash
k6 run load-tests/k6.js
```

With overrides:

```bash
k6 run \
  --env BASE_URL=https://dukapilotproduction.up.railway.app \
  --env MERCHANT_PHONE=+255700000002 \
  --env MERCHANT_PIN=1234 \
  load-tests/k6.js
```

## Default test profile

| Stage | VUs | Duration |
| ------- | ----- | ---------- |
| Ramp-up | 0 → 10 | 30s |
| Sustained | 10 | 1m |
| Ramp-down | 10 → 0 | 15s |

Total duration: ~1m 45s

## Pass thresholds

| Metric | Threshold |
| -------- | ----------- |
| All requests p95 | < 800ms |
| Login p95 | < 1000ms |
| Dashboard p95 | < 800ms |
| Products p95 | < 600ms |
| Sales p95 | < 600ms |
| Error rate | < 1% |

k6 exits with code 1 if any threshold is breached.

## Endpoints tested

1. `GET /health` — unauthenticated health check
2. `POST /api/auth/login` — merchant + supplier login
3. `GET /api/dashboard?period=today|week|month` — dashboard (3 calls per VU)
4. `GET /api/products?limit=20` — inventory list
5. `GET /api/sales?limit=20` — sales list
6. `GET /api/orders` — supplier orders list
7. `GET /api/products/low-stock` — low-stock alerts
8. `GET /api/suppliers/portal/orders` — supplier portal (every other VU)
9. `GET /api/public/shops` — public catalog (unauthenticated)
10. Invalid token → verify 401 response

## Results

Results are saved to `load-tests/results.json` after each run (gitignored).
A summary is printed to stdout:

```
╔══════════════════════════════════════════╗
║         DukaPilot Load Test Summary          ║
╠══════════════════════════════════════════╣
║  Login p95:      312ms                   ║
║  Dashboard p95:  245ms                   ║
║  Products p95:   180ms                   ║
║  Sales p95:      190ms                   ║
║  Total reqs:     1840                    ║
║  Error rate:     0.00%                   ║
╚══════════════════════════════════════════╝
```
