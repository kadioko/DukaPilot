# Demo Showcase Seeding

`backend/scripts/seed-demo-showcase.js` refreshes the public DukaPilot demo
businesses used on `/demo`. It is a separate, guarded script because the broad
legacy seed is not appropriate for repeatedly refreshing a hosted demo database.

## What it refreshes

- public merchant demo PINs, owner names, language, and active Pro access;
- the three public supplier demos with verified profiles and current catalog items;
- a Duka la Amina cashier-and-stock demo account with no report permission;
- a bar and a restaurant with saved recipes, preparation batches, inventory,
  stock movements, a current sale, and a current operating cost;
- a crops-only farm with plots, crop cycles, seed/fertilizer/labour inputs,
  two maize harvest batches, harvest grades, a buyer commitment, a field task,
  irrigation, and a manual weather observation; and
- a poultry-and-pigs farm with farm profiles, groups, animal events, feed,
  egg and pork production, egg packing, stock movements, and a current sale.

All refreshed shops are marked `isDemo`, hidden from the public catalog, and
given an active Pro subscription for one year. The script adds only records with
the `demo-showcase-` identifier prefix, so it can update its own data safely.
It never deletes ordinary merchant records.

## Safety rules

1. Run it only after reviewing the account list below.
2. It refuses to change a target phone when that phone belongs to a shop that is
   not already marked as a demo.
3. It requires the exact environment confirmation value; there is no default
   write mode.
4. Do not use it to create a real customer, reset a real customer PIN, or seed
   production-looking data into a real shop.

## Demo logins

Every account in this list uses the public demo PIN `1234`. Platform admin PINs
are deliberately not documented here.

| Scenario | Phone | Account |
| --- | --- | --- |
| General shop | `+255700000002` | Mama Amina / Duka la Amina |
| Cashier and stock | `+255700000008` | Rehema - Sales & Stock at Duka la Amina |
| Pharmacy | `+255700000003` | Bwana Salum / Salum Pharmacy |
| Bar | `+255700000004` | Hassan Juma / Hassan Bar & Kitchen |
| Restaurant | `+255700000009` | Mama Ntilie / Mama Ntilie Restaurant |
| Crops-only farm | `+255700000012` | Asha Macha / Kijani Mazao Farm |
| Poultry and pigs | `+255700000013` | Musa Selemani / Upendo Poultry & Pigs Farm |
| Beauty shop | `+255700000005` | Fatuma Ally / Fatuma Beauty Shop |
| General supplier | `+255700000001` | Jumla Traders Ltd |
| Beverage supplier | `+255700000006` | Rafiki Beverages Ltd |
| Beauty supplier | `+255700000007` | Beauty Supplies TZ |

## Production command

Run this from the linked Railway service shell, or use the Railway CLI from
`backend/`. It writes only after the confirmation variable is present:

```powershell
cd backend
$env:DEMO_SHOWCASE_CONFIRM="REFRESH_DUKAPILOT_DEMO_SHOWCASE"
railway run npm run db:seed-demo-showcase
```

For a local database, use the same command without `railway run` after setting
the local `DATABASE_URL`:

```powershell
$env:DEMO_SHOWCASE_CONFIRM="REFRESH_DUKAPILOT_DEMO_SHOWCASE"
npm run db:seed-demo-showcase
```

## Verification

After the command reports success, test at least these paths:

1. Log in to Duka la Amina and confirm sales, inventory, debts, supplier
   orders, and the AI assistant are populated.
2. Log in as Rehema and confirm Sales and Inventory work, while Reports and
   profit values are unavailable.
3. Log in to Hassan Bar & Kitchen or Mama Ntilie Restaurant and open
   `Prepare Food` to see a saved recipe and recent batch.
4. Log in to Kijani Mazao Farm and confirm Crops and Field plan show plots,
   inputs, harvests, a task, irrigation, a buyer commitment, and a weather
   observation.
5. Log in to Upendo Poultry & Pigs Farm and confirm Farm shows Layers and Pigs
   groups, production batches, and egg packing.
6. Confirm demo shops do not appear in the public `/catalog`.

Do not record real customer information, real payment references, or real
commercial sales in any demo account. Refresh the showcase before an important
demo if another tester changed its visible data.
