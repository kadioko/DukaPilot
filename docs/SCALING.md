# DukaPilot Scaling Notes

## Current production shape

DukaPilot uses Railway PostgreSQL and a single backend instance today. Product, sale, customer-order, supplier, and quotation queries are tenant-scoped and bounded. The public marketplace and each published shop catalog load products in pages of at most 100; the user interface starts with 60 and offers search plus “load more”. The additive `products_low_stock_active_idx` migration keeps the database-side low-stock page ordered and narrow as catalogues grow.

## Redis for multiple Railway instances

Set `REDIS_URL` on the Railway backend only when running more than one backend instance. Use the private connection URL from a Railway Redis service (or another managed Redis provider), then redeploy.

Redis is optional. Without it, DukaPilot keeps the existing in-memory rate limiter and a per-instance dashboard cache, which is correct for one backend instance. With it, rate-limit counters are shared across instances, so authentication, OTP, public catalog, order, event, and status protections cannot be bypassed by landing on a different instance.

Merchant Balance deposit, quote, withdrawal, manual-check, and reconciliation
routes also use purpose-specific limits. Configure Redis before horizontally
scaling Railway so an attacker or retrying client cannot multiply provider calls
by landing on different instances.

## Dashboard cache

The expensive all-time sales and monthly-history aggregation is cached per shop for 30 seconds. It is cleared immediately after a sale, sale void, quotation conversion, catalog-order conversion, or expense change. Redis shares this cache when configured; otherwise it remains local to the instance.

## Payment reconciliation bounds

The scheduled nTZS job processes at most 100 known Merchant Balance and 100
known subscription records per run. Queries are limited to pending/review
provider operations and completed Merchant Balance subscription debits whose
treasury transfer is unresolved. Results are ordered and bounded, so the job
does not scan settled history. Revisit the
batch size or add a durable work queue only if monitored backlog shows that one
15-minute run cannot catch up; do not add queue infrastructure pre-emptively.

## When to revisit

Before a shop regularly reaches tens of thousands of products or hundreds of thousands of sales, inspect PostgreSQL query plans using production-safe `EXPLAIN ANALYZE` and add only evidence-backed indexes or summary tables. Do not introduce table partitioning or background queues merely because they sound scalable.
