# Farm Operations

DukaPilot remains a commercial system for Tanzanian shops: sales, stock, cash, customers, debts, receipts, and supplier buying are its core. Farm Operations is a focused, category-aware production layer for a poultry or livestock merchant who needs to turn farm inputs into sellable output without double-counting cost or cash.

It does not replace the normal DukaPilot workflow. Eggs, milk, animals, or harvested output still sell through the usual POS, customer order, receipt, debt, and reporting flows.

## Who sees it

Set the shop category to **Livestock & Poultry Farm** / **Ufugaji wa Mifugo na Kuku** in Settings. The **Farm** / **Ufugaji** navigation item, farm help guide, and farm AI actions appear only for that category. The API checks the category too, so another category cannot use farm endpoints by guessing a URL.

An owner can then choose one or more operating profiles:

- Layers / eggs
- Broilers
- Dairy
- Beef cattle
- Goats and sheep
- Pigs
- Mixed livestock

Profiles are activities, not a second shop category. A farm can begin with layers and add dairy later.

## First setup

1. In **Inventory**, create the supplies and sellable outputs. For a layers farm this could be `Layer feed` (kg), `Egg` (each), and `Egg tray` (tray).
2. Receive feed, medicine, packaging, and other supplies through **Receive Stock**. They remain stock until they are actually used.
3. Open **Farm** and select the production profiles used by the farm.
4. Add a flock, pen, herd, or batch. Use a group rather than creating a record for every chicken or low-value animal.
5. Record additions, mortality, or culls as they happen.

## Daily layers / eggs workflow

1. Receive feed and egg trays through **Receive Stock**.
2. In **Farm > Record production**, choose the flock and the sellable `Egg` product.
3. Enter expected and actual eggs collected, then add the feed, medicine, and packaging actually consumed. The supplies are reduced only after the batch saves.
4. Record cracked or unsellable eggs as the difference between expected and actual output.
5. DukaPilot increases individual egg stock and calculates the batch's estimated cost per egg from consumed supplies and any direct cost.
6. In **Pack farm output**, convert 30 individual eggs into one `Egg tray` product. This moves existing stock and cost; it does not create a second purchase.
7. Sell eggs or trays normally through POS, QR shop orders, receipts, customers, and debts.

## Other farm profiles

The same group and production foundation applies to broilers, dairy, cattle, goats, sheep, and pigs:

- **Broilers:** chick batch, feed/medicine used, mortality, then live-bird or harvested output.
- **Dairy:** herd or group, feed/medicine used, collected milk, and spoilage. For now use `ml` as the base stock unit: 1,000 ml equals one litre. Pack ml into bottles with the packing flow.
- **Cattle, goats, sheep, and pigs:** use groups or pens, record additions and losses, consume inputs, then add saleable animals or harvested outputs by head or a suitable stock unit.

This first release intentionally does not offer veterinary diagnosis, treatment advice, breeding records, animal-weight charts, or individual tags for every animal. Those are future tools for larger farms, not requirements for a small farm to begin operating.

## Cost and cash rules

Farm accounting follows the same principle as Food Preparation:

- Supplies received but not used are **inventory**, not immediate ordinary expenses.
- The cost of feed, medicine, packaging, and other supplies moves into the farm output only when a production batch consumes them.
- An optional direct production cost (for example labour, water, or charcoal) is added to the batch cost.
- When that direct cost is paid in **Cash**, it appears once as a cash-out in **Daily Close**. Do **not** enter the same payment again in Expenses.
- A farm batch updates the output product's current estimated unit cost. Sale records preserve their sale-time cost, so sales reports continue to calculate realized profit from the cost at sale time.

The cost shown while producing is an **estimated production cost**, not a claim of exact realized profit. Weighted-average/FIFO costing is a later upgrade for farms that need more precise costing across many batches.

## Staff and privacy

In **Staff**, owners can enable **Manage farm production** / **Kusimamia uzalishaji wa shamba** for a member of staff. That permission is separate from selling, stock, expenses, and reports.

- A cashier may sell eggs, milk, or other farm outputs only if they have normal selling permission.
- A farm-production staff member may manage groups, losses, production, and packing.
- Cost figures in farm production history are redacted for staff without report access.
- Owners and managers retain their existing full access.

## Farm AI

For Pro shops, the AI Assistant can surface farm operation reminders for eligible staff: production not recorded for an active layer group, recent animal loss, and unusually high output waste. These are operational prompts only. DukaPilot does not provide veterinary, disease, treatment, or animal-health advice.

## Deployment

The Farm Operations migration is additive and runs automatically in Railway through the production startup migration step. For a manual deployment:

```powershell
cd backend
npm run db:deploy
```

Then deploy the backend before the frontend so the `/api/farm` endpoints and database tables are available when the Farm screen is published.
