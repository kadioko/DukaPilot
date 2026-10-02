# Demo Sales History Seeder

Use this script only for a DukaPilot demo shop. Normal `POST /api/sales` requests intentionally use server time so a merchant or client cannot rewrite the sales audit trail.

The seeder uses Prisma directly to:

- spread 60-80 completed demo sales across the last 30 Tanzanian calendar days;
- keep every day represented, with a busier Friday/Saturday curve;
- redistribute existing recent demo sales first, removing the artificial "all today" spike;
- create only the missing sales needed to reach the target;
- preserve sale totals, items, receipts, and linked credit-debt dates for existing sales;
- mark the target as a demo shop and remove it from the public catalog.

The history seed does not create Daily Close sessions or stock receipts. Demonstrate those workflows with a fresh controlled entry during a demo so the opening cash, counted cash, variance, landed cost, and stock history match the values you explain.

It does not change current product stock when it creates synthetic historical sales. This avoids corrupting the demo shop's present-day inventory balance.

## Current Demo Snapshot

As of 2026-10-02, all seven public merchant demos have 72 completed, illustrative sales spread across the previous 30 Tanzania calendar days, ending on 2026-10-02. The crop farm history uses harvested maize and tomatoes; the livestock farm history uses eggs, egg trays, and pork. These are sample transactions, not merchant activity. They do not decrement current product stock, create stock receipts, or create Daily Close sessions. Do not use demo reports to reconcile real cash, inventory, or accounting.

## Production Schema Preflight

The 2026-10-02 production showcase refresh initially found that Railway's `sales` table lacked `createdByStaffId`. Migration `20261002001000_sales_staff_ownership` was subsequently applied and verified on Railway, including the column and staff-sales index. The full guarded showcase refresh then completed successfully. The production migration status reported all 48 migrations applied.

Before future production seeding, confirm the current migration status and required schema rather than relying on this historical completion note. The showcase command remains guarded; follow [Demo Showcase Seeding](./DEMO_SHOWCASE_SEEDING.md) and verify the affected demo workflows afterward.

## Quotation demo data

The history seeder does not create or alter quotations. The featured demo shop has a deliberate quotation pipeline recorded in [QUOTATIONS.md](./QUOTATIONS.md#live-demo-examples): one draft, three sent, three accepted, and one rejected quotation. Those records are unconverted and unpaid, so they do not affect the seeded sale history, stock, debts, or reports.

Use a new controlled quotation when demonstrating acceptance, conversion, deposits, payments, or stock-linked line-item deductions. Do not convert the display quotations during an ordinary product demo.

## Safety Guard

The default target is the featured `Duka la Amina` seed account (`+255700000002`). Any other target must already have `Shop.isDemo = true`. The command refuses to run without an exact confirmation value and refuses to partially redistribute a window containing more than 80 completed sales.

Run from `backend/` in the Railway service shell or another environment that has the production `DATABASE_URL`:

```powershell
$env:DEMO_HISTORY_CONFIRM="SEED_DUKAPILOT_DEMO_HISTORY"
$env:DEMO_SHOP_PHONE="+255700000002"
$env:DEMO_HISTORY_SALE_COUNT="72"
$env:DEMO_HISTORY_DRY_RUN="1"
npm run db:seed-demo-history
```

Review the dry-run output. It reads the target and planned counts without writing anything. Remove `DEMO_HISTORY_DRY_RUN` only after the shop name, demo flag, product count, recent sale count, and 30-day target are correct.

Optional: set `DEMO_HISTORY_END_DATE=YYYY-MM-DD` to pin the reporting window to a specific demo date. Without it, the script ends the window on today's date in Tanzania.

Expected output reports the shop, total sales, number of represented days, how many existing sales were redistributed, and how many demo-only sales were created. Rerunning for the same window redistributes the same recent sales and does not create more once the target is reached.
