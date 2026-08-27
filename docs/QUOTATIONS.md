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

## AI Assistant priorities

On DukaPilot Pro, the AI Assistant includes quotation pipeline work in the daily command list. It can flag:

- an accepted quotation waiting for the business to convert it into one sale;
- a deposit that is still unpaid or past its due date;
- a sent quotation that will expire within three days; and
- an expired quotation that needs follow-up, a new revision, or a clean close-out.

The assistant reads only the shop-scoped quotation status, customer, title, dates, totals, payment progress, and deposit requirement required for these actions. It does not expose internal costs, supplier details, private notes, markup, or estimated profit. It also never treats a quotation, acceptance, or deposit as realised revenue by itself.

## Roles

Owners retain access. Staff can be granted independently: view quotations, create drafts, revise shared quotations, view internal costs, approve discounts, send, accept/reject, convert to sales, record payments, archive, and delete unshared drafts. The staff page exposes these switches.

## Quotation settings

Open **Quotations > Quotation settings** to set defaults for future quotations. Existing quotations and their shared revisions are not silently changed.

- **Prefix and number format:** For example, `QT-0001`. The format accepts `{prefix}`, `{number}`, and `{year}`. Numbers are sequential per shop and remain unique.
- **Validity period:** The default number of days before a quote expires. A user can choose another expiry date on an individual quote.
- **Currency and tax:** TZS is the default. Tax is stored as a percentage and calculated in whole TZS on the server, line by line.
- **Customer document language:** Choose **Kiswahili** or **English** for new customer documents. The chosen default is saved on every new quotation and revision, so its public link, PDF, printout, and WhatsApp share message stay in that language. Existing shared quotations keep their current English presentation.
- **Payment terms, customer note, and terms:** Reusable wording inserted into each new quote. These can be edited for one project without changing the default.
- **Signature name:** The text below the customer document signature line. The current release uses a typed signature area; an uploaded/drawn signature is a future enhancement.
- **Customer visibility:** Toggle quantities, unit prices, item discounts, and section headings. These toggles control the public link, PDF, and print document only. Internal cost and profit fields are never customer-visible.
- **Default deposit:** The percentage used to calculate the deposit required on a new quote. It is a request, not proof of payment. Record received money separately as a deposit, milestone, or final payment.

## Live demo examples

The featured **Duka la Amina** demo shop contains eight quotation examples. They demonstrate the pipeline without changing revenue, payment, debt, or stock records.

| Status | Quotations | What they demonstrate |
| --- | --- | --- |
| Draft | `QT-0001` Kifurushi cha bidhaa za ofisi | An unfinished product quotation that can still be edited freely |
| Sent | `QT-0002` Usambazaji wa bidhaa kwa sherehe; `QT-0005` Kifurushi cha vinywaji kwa kikao; `QT-0006` Huduma ya kupeleka mahitaji ya nyumbani | Quotes ready to share or follow up with a customer |
| Accepted | `QT-0003` Kifurushi cha chakula kwa ofisi; `QT-0007` Kifurushi cha chakula kwa familia; `QT-0008` Huduma ya kufunga na kusafirisha oda | Accepted work that can later be converted to a sale when the merchant confirms it |
| Rejected | `QT-0004` Kifurushi cha hafla ya Jumamosi | A declined quote and rejection workflow |

All eight are intentionally unconverted and have no recorded payment. Keep them that way when demonstrating the quotation pipeline; create a fresh controlled quote for conversion, deposit, payment, or stock-deduction demonstrations.

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
