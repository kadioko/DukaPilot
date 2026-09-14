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

## AI and offline behaviour

For eligible Pro accounts, the assistant can flag unrecorded layer production,
livestock losses, crop cycles with no inputs, harvests due within seven days,
harvest stock that remains unsold after a week, a crop with no irrigation record
for seven days, overdue field tasks, and unresolved manual field warnings.
These are operational prompts, not veterinary, crop-health, pesticide, weather,
or agronomy advice.

Crop inputs and harvests have a safe browser retry queue. If the connection
drops while the Crop operations screen is open, the pending operation is scoped
to the current business, branch, and actor. It keeps the same client request ID
when it retries, so the backend cannot deduct stock or create a harvest twice.
The screen shows the pending count and offers a manual retry; switching branches
is blocked until it is resolved.

Irrigation, field tasks, grades, buyer commitments, and weather observations
remain online-only for now. They will join the queue only after real-farm QA has
confirmed the appropriate conflict rules for each record type. An offline app
restart still opens the standard fallback rather than a full cached crop screen.

## Database and deployment

The additive migration is:

\`\`\`text
20260914001000_crop_operations
20260914002000_crop_operations_v2
\`\`\`

Together they add farm settings, crop plots and cycles, input usages, harvest
batches, harvest-sale allocations, durable input-cost allocations, seasonal
budgets, irrigation logs, field tasks, buyer commitments, harvest grades, manual
weather alerts, and client request keys for duplicate-safe crop retries.

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
