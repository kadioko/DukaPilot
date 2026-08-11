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

Optional: set `DEMO_HISTORY_END_DATE=2026-08-06` in `YYYY-MM-DD` format to pin the reporting window to a specific demo date. Without it, the script ends the window on today's date in Tanzania.

Expected output reports the shop, total sales, number of represented days, how many existing sales were redistributed, and how many demo-only sales were created. Rerunning for the same window redistributes the same recent sales and does not create more once the target is reached.
