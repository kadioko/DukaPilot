# Farm Operations

DukaPilot's commercial core is sales, stock, cash, customers, debts, expenses,
supplier buying, and reports. Farm Operations adds a focused layer so a small
farm can connect field or livestock activity to inventory and normal sales
without recording the same cost twice.

## Farm type and access

There are two farm categories:

- **Livestock & Poultry Farm** / **Ufugaji wa Mifugo na Kuku** keeps the
  existing livestock workflow.
- **Crop & Livestock Farm** / **Mazao na Ufugaji** opens a Farm setup where
  the owner chooses **Crops**, **Livestock**, or **Both**.

The API checks both category and selected farm mode. A crop-only farm does not
receive animal-group forms, and a livestock-only farm cannot call crop routes by
guessing a URL. Owners set the farm type. Staff need \`canManageFarm\` to record
farm work; this permission does not grant report access.

## Crop workflow

1. In **Crops**, use **Starter products** to create zero-stock input products
   for \`Mbegu\`, \`NPK Mbolea\`, and \`Dawa ya mimea\`. When a cycle is
   selected, it also creates a dedicated output product such as
   \`Mahindi - Shamba A\`. Prices and stock quantities are still set by the
   farmer in **Inventory**.
2. In **Crops**, add a plot, field, bed, or greenhouse with its location and
   area in acres, hectares, or square metres.
3. Start a crop cycle with a plot, crop, optional variety, planting date, and
   expected harvest. Maize, beans, rice, vegetables, cassava, sunflower,
   tomatoes, onions, and custom crop names are supported.
4. Record inputs against that cycle. A stocked seed, fertilizer, or pesticide
   reduces inventory only when used. Direct labour, transport, and irrigation
   costs are allocated to the crop cycle.
5. Record each harvest with a dedicated output product. It becomes normal
   sellable inventory immediately, ready for POS, catalog, or customer orders.

### Repeated harvests and cost integrity

One crop cycle can have multiple harvest batches. This supports tomatoes,
vegetables, and other crops picked over several days. Before the first pick,
set the cycle's expected total yield. That total is fixed once harvesting begins
and gives DukaPilot a stable, auditable basis for allocating costs.

Every input-to-harvest allocation is stored in a durable ledger. Inputs entered
later are allocated fairly as later harvests arrive. When the owner closes a
cycle, any remaining unallocated cost is added only to unsold harvest stock. A
sale that already happened keeps its original recorded cost. If all harvest
stock has already been sold, the remaining cost is kept as unrecovered cycle
cost instead of silently rewriting historic profit.

Produce can also be split into grades such as Grade A and Grade B. Grades cannot
exceed the harvest quantity.

Use a dedicated output product for a harvest, such as \`Maize Field A\`, rather
than an already-stocked generic \`Maize\` product. The first harvest is blocked if
the selected product already has another stock source. That makes crop sales
allocation and profit reporting meaningful.

## Reporting and privacy

Each cycle shows harvested quantity, wastage, remaining harvest stock, and sold
quantity. Owners, admins, and staff with report permission also see input cost,
cost per area, realised revenue, and realised profit. Farm staff without report
permission can record plots, cycles, inputs, harvests, and status changes but do
not receive financial values.

Harvest sale allocation uses crop harvest lots in FIFO order for dedicated crop
products. Voiding a sale restores the lot allocation, remaining quantity, and
cost. A direct cash crop cost joins an open Daily Close session once; do not also
enter it as an Expense.

## Field plan

The **Field plan** link in Crops is the mobile workspace for recurring field
work. It provides:

- irrigation logs by crop cycle;
- assigned field tasks and completion status;
- harvest grades;
- manual weather observations and resolution status; and
- owner-only seasonal budgets and buyer commitments.

Weather observations intentionally record what the farm saw. They are not a
forecast service and must not be used as pesticide, health, or agronomy advice.
Actual crop revenue is still recorded through **Sales**; a buyer commitment is
only a planning record. Field staff with farm permission can record field work,
but do not receive cost, price, budget, buyer-price, revenue, or profit fields.

## Livestock workflow

Livestock operations remain available for layers, broilers, dairy, beef, goats
and sheep, pigs, and mixed livestock. Farmers can create flocks, pens, herds, or
batches; record additions, mortality, and culls; consume feed and supplies; add
eggs, milk, or other output to stock; and pack output such as eggs into trays.

For live-animal sales, first create a dedicated inventory product (for example,
"Goat - live") and link it to one active animal group in Livestock. Linking
initializes product stock from the group's animal count when the product is
empty; otherwise the counts must already match. POS, catalog-order conversion,
and quotation conversion then reduce both inventory and the linked herd count
and record a `SALE` event against the sale item. Voiding the sale restores both
counts and marks that event voided instead of deleting the audit history. Sell
live animals as whole numbers only. This link is not for eggs, milk, meat stock,
or other processed output; keep those products separate.

Animal additions, mortality/culls, production batches, and packing conversions
accept a client retry key. If the phone loses a successful response, retrying
the same operation with the same key returns the saved record without repeating
stock or herd changes. Livestock output products use moving weighted-average
cost across remaining stock and newly produced/packed batches; each sale keeps
the unit cost recorded when that sale item is created. This is an average-cost
valuation, not per-batch FIFO.

When farm staff do not have Reports permission, crop responses remove prices
from nested output-product records as well as from crop cost and profit fields.
Closed and cancelled crop cycles are terminal and cannot be reopened through
the API. Cycle wastage is bounded by the planned total yield across all harvest
batches; correct the cycle plan before recording a harvest if the expected total
was entered incorrectly.

## AI and offline behaviour

For eligible Pro accounts, the assistant can flag unrecorded layer production,
livestock losses, crop cycles with no inputs, harvests due within seven days,
harvest stock that remains unsold after a week, a crop with no irrigation record
for seven days, overdue field tasks, and unresolved manual field warnings.
These are operational prompts, not veterinary, crop-health, pesticide, weather,
or agronomy advice.

Crop inputs, harvests, irrigation logs, field tasks, harvest grades, buyer
commitments, and manual weather observations use a safe browser retry queue. If
the connection drops while the Crop operations or Field plan screen is open,
the pending operation is scoped to the current business, branch, and actor. It
keeps the same client request ID when it retries, so the backend cannot deduct
stock, create a harvest, or duplicate a field record twice. Updates also carry
the record version they started from; an older offline update is held for review
instead of overwriting newer work from another phone.

The Crop and Field plan screens show the pending count and offer a manual retry.
The existing Admin > Offline sync watch labels crop-field events separately from
sales events, retains the device label, and lets support mark a failed retry
Open, Contacted, or Resolved. A failed item stays on the originating shop's
device until the farmer opens or refreshes the record and sends a current
version.

This is intentionally **not** a full offline accounting system. Seasonal
budgets, expenses, debt payments, stock receiving/adjustments/counts, staff and
permission changes, subscriptions, branch transfers, quotations, and cash-close
workflows remain online-only. Each affects money, stock, authority, or a shared
ledger and needs a separate reconciliation design before it can safely queue.
An offline app restart still opens the standard fallback rather than a fully
cached crop workspace.

## Database and deployment

The additive migration is:

\`\`\`text
20260914001000_crop_operations
20260914002000_crop_operations_v2
20260914003000_crop_field_offline_sync
20261002002000_farm_reliability_and_livestock_sales
\`\`\`

Together they add farm settings, crop plots and cycles, input usages, harvest
batches, harvest-sale allocations, durable input-cost allocations, seasonal
budgets, irrigation logs, field tasks, buyer commitments, harvest grades, manual
weather alerts, durable field-operation receipts, crop-field sync event labels,
and client request keys for duplicate-safe crop retries. The final migration in
that list adds livestock retry keys, live-animal sale linkage/void history, and
safe whole-herd synchronization with POS stock. Deploy it with
`npm run db:deploy` before enabling live-animal product linking in production.

Deploy the backend migration before publishing the frontend:

\`\`\`powershell
cd backend
npm run db:deploy
\`\`\`

Railway production startup also runs \`prisma migrate deploy\`. After deployment,
verify a crop farm can choose Crops, Livestock, or Both; add a plot and cycle;
create starter products; use stock as an input; record direct labour; record two
harvest batches against a planned total; sell the harvest; close the cycle; and
see the owner report while a farm staff account cannot see money or profit.

## Demo accounts

Use `Kijani Mazao Farm` for a crops-only walkthrough and `Upendo Poultry & Pigs
Farm` for livestock. Their existing sample setup includes plots, harvests,
field work, layers, pigs, production, and packing. As of 2026-10-02, their
sales history has 72 illustrative sales across 30 days, but that history refresh
does not refresh crop or livestock events. The full showcase refresh completed
on 2026-10-02 after Railway applied migration
`20261002001000_sales_staff_ownership`. Check current demo login details and
refresh boundaries in [Demo Showcase Seeding](./DEMO_SHOWCASE_SEEDING.md)
before promising a freshly reset farm walkthrough.
