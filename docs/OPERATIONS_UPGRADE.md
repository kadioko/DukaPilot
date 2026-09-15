# Operations Upgrade

## Daily Close / Z-Report

Cashiers start a cash session before trading by recording the opening cash in the drawer. While that session is open, DukaPilot automatically attaches that cashier's cash sales, cash debt collections, and cash expenses to it.

At close, the cashier enters the cash physically counted. DukaPilot calculates:

- opening cash
- cash sales
- cash debt collections
- cash expenses
- expected cash
- counted cash and variance

Owners can see all of today's sessions and may open their own separate cash session when they sell. Staff can see and close only their own session, unless the owner explicitly grants a trusted manager **Manage team shifts**. That permission lets the manager review and close a staff drawer after counting it; it can be granted without **Sell**, but then the manager cannot open a personal sales drawer. It never merges drawers or moves sales between sessions. Historic transactions made before this release are intentionally not backfilled into a session.

Only **cash** activity recorded while that cashier's session is open contributes to its expected cash. M-Pesa, bank, credit, and transactions recorded before opening a session stay outside the close figure. This makes the close a clear accountability tool, not a retroactive accounting adjustment.

## Receive Stock

Use **Receive Stock** instead of recording product purchases in Expenses. A receipt stores:

- supplier and optional supplier-order source
- invoice number, payment method, received date, and note
- product quantities and unit buying cost
- transport and other landed costs

Additional costs are distributed across the received items by their product cost. The resulting landed unit cost becomes the product's buying price for future sale-profit calculations, while completed sales keep their original historical buying cost.

Receiving an existing supplier order from **Orders** opens a prefilled receipt and marks the order delivered only after the stock receipt is saved.

For an order-linked receipt, the supplier and products must match the selected order. The merchant may record the actual delivered quantity and actual cost, which can differ from what was originally ordered.

## Receipt Sharing And Printing

Completed and historic sales support:

- WhatsApp text receipt
- PNG receipt file for WhatsApp Status or sharing
- PDF receipt file for sharing or storage
- thermal-friendly printing through the browser/device print dialog

For a portable Bluetooth thermal printer, pair it with the Android device first, select **Print** in DukaPilot, then choose that printer in Android's print dialog. This is more reliable across printers than attempting a browser-only direct Bluetooth connection, which is unsupported by many portable printer models and iPhones.

## QR Ordering Position

Every published shop has a shareable catalog link and downloadable QR code in **Settings > Shop Details**. The new share action prepares a customer-ordering message. Customers can browse the catalog, place an order, and the order appears in DukaPilot for the shop to handle.

Use the QR on WhatsApp Status, a counter sign, packaging, or a customer-facing receipt. Before sharing, verify the shop is published and prices/products are ready for customers to see.

## Multi-Branch Pro

Branches are live for Pro businesses. Pro includes four locations in total, including
the main shop, and each additional location costs TZS 10,000/month. Each location
keeps separate stock, sales, staff, customers, debts, orders, quotations and Daily
Close records. Owners can view a combined monthly overview and transfer stock between
locations; staff remain assigned to one location. See [BRANCHES.md](BRANCHES.md) for
the billing rules, transfer safeguards and release checks.
