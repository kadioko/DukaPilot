# Quotations and estimates

DukaPilot quotations support service, project, and stock businesses. A quotation is a non-posting document: creating, sharing, accepting, or rejecting it does not create revenue, a sale, stock movement, or realised profit.

## What is included

- Custom work lines for materials, labour, transport, design, installation, subcontractors, services, and other charges.
- Linked inventory lines only deduct stock after an accepted quotation is converted to a sale.
- A small saved-service catalogue for repeat work such as installation or design fees. It is separate from stock.
- Customer records scoped to a shop, customer autocomplete, sequential shop-specific quotation numbers, deposits, milestone payments, revisions, acceptance, rejection, archival, and conversion to a DukaPilot sale/debt.
- Public links use a 32-byte unguessable token and point to an immutable shared revision.
- The PDF, print view, WhatsApp link, and public view are built only from a public snapshot. They never contain estimated costs, supplier/subcontractor details, markup, estimated profit, private notes, product IDs, staff IDs, or tenant IDs.

## Accounting rules

1. A quotation's `totalAmount` is pipeline value, never confirmed revenue.
2. `estimatedProfit` is a planning figure, not realised profit.
3. Acceptance does not create a sale or payment.
4. Conversion creates exactly one linked sale. The unique `sales.quotationId` constraint and guarded status update prevent duplicate conversion.
5. A deposit/milestone is held as a quotation payment. On conversion, it is linked into the existing debt-payment flow without a second sale.
6. Only product-linked lines use DukaPilot's existing stock decrement and stock-history transaction. Service/custom lines do not touch inventory.

## Roles

Owners retain access. Staff can be granted independently: view quotations, create drafts, revise shared quotations, view internal costs, approve discounts, send, accept/reject, convert to sales, record payments, archive, and delete unshared drafts. The staff page exposes these switches.

## Deploying

1. Back up production as normal.
2. Deploy the backend first; its production start command runs `prisma migrate deploy`.
3. Or run `cd backend && npm run db:deploy` against the production database.
4. Deploy the frontend after the API migration succeeds.
5. No new environment variables are required.

The migration is additive: it creates `customers`, `services`, quotation tables, indexes, staff permission columns, and nullable quote links on sales/items. Existing sales and inventory data are preserved.

## Manual release checklist

- Create a draft with a custom labour line, a saved service, and an inventory product.
- Confirm customer PDF/public link contains no internal cost or private note.
- Send, open the link in an incognito browser, accept, then edit the quote and confirm a new revision must be resent.
- Record a deposit, convert once, confirm the linked sale/debt and remaining balance are correct.
- Confirm only the inventory product's stock changed, and voiding the converted sale restores only that product.
- Test a staff account with view-only access and another without internal-cost permission.
- Check an expired link, rejection, archive, duplicate, and draft delete.

## Current limits and next improvements

- Customer signatures are text confirmation today; a drawn signature/image capture can be added later.
- Email sharing is recorded as a share method, but sending mail depends on a future transactional email provider.
- Service catalogue management is API-backed in this release; saved services can be created through `POST /api/quotations/services`. A dedicated catalogue screen is a sensible next small UX iteration.
- Quotes are shop-scoped. Branch-level reporting is reserved for the future multi-branch architecture.
