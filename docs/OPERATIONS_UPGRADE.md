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

Owners can see all of today's sessions; staff can see and close only their own session. Historic transactions made before this release are intentionally not backfilled into a session.

## Receive Stock

Use **Receive Stock** instead of recording product purchases in Expenses. A receipt stores:

- supplier and optional supplier-order source
- invoice number, payment method, received date, and note
- product quantities and unit buying cost
- transport and other landed costs

Additional costs are distributed across the received items by their product cost. The resulting landed unit cost becomes the product's buying price for future sale-profit calculations, while completed sales keep their original historical buying cost.

Receiving an existing supplier order from **Orders** opens a prefilled receipt and marks the order delivered only after the stock receipt is saved.

## Receipt Sharing And Printing

Completed and historic sales support:

- WhatsApp text receipt
- PNG receipt file for WhatsApp Status or sharing
- PDF receipt file for sharing or storage
- thermal-friendly printing through the browser/device print dialog

For a portable Bluetooth thermal printer, pair it with the Android device first, select **Print** in DukaPilot, then choose that printer in Android's print dialog. This is more reliable across printers than attempting a browser-only direct Bluetooth connection, which is unsupported by many portable printer models and iPhones.

## QR Ordering Position

Every published shop has a shareable catalog link and downloadable QR code in **Settings > Shop Details**. The new share action prepares a customer-ordering message. Customers can browse the catalog, place an order, and the order appears in DukaPilot for the shop to handle.

## Multi-Branch Pro Roadmap

Multi-branch is deliberately not live yet. Before introducing it, DukaPilot needs a branch-aware inventory model, stock transfers, per-branch cashier sessions, branch-level permissions, and consolidated reporting. We will validate demand with the first 20-30 active shops before committing to that migration. It is positioned as a future Pro capability, not a promise that current one-shop data already supports multiple locations.
