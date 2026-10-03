# Admin operations

The platform admin opens `/admin` with an ADMIN account. The primary mobile navigation is Overview, Needs Action, Payments, and Support. More tools holds users, suppliers, referrals, sync history, SMS, WhatsApp, audit logs, and PIN reset.

## Daily support workflow

1. Open **Needs Action**. This is a server-paged list of root businesses that are suspended, expired, nearing trial end, marked Needs Help or Churn Risk, due for follow-up, or have an open report. Search by business name, owner name, or owner phone. Switch to All shops to locate any business.
2. Open the business. Review its plan, owner, branches, last completed sale, payment history, support reports, and unresolved sync failures. Use **Payments** for subscription changes.
3. Assign an admin and a next follow-up date. Use **Mark contacted** after contact. Add a dated support note. Notes append to the history; an older legacy note remains visible until the first new note is added.
4. Resolve payment requests from verified evidence, then record the plan or payment through the existing subscription controls. Review unusual provider checkouts in the payment exceptions area.

Each business note has its own author and timestamp. The migration imports existing single-field notes as legacy entries, using the last-contact date when available. The latest text is also kept in `followUpNotes` so older screens still show a summary. Never enter a customer's PIN or full payment credentials into notes.

## What the overview means

- **Support issues**, **billing requests**, **high-priority reports**, **qualified referrals**, and **suppliers to review** are database-wide counts. The Reports tab loads 25 records per page and uses database-wide status totals.
- **Shops need action** counts root businesses matching the Needs Action filter. The short overview preview is not the full queue; use Needs Action to page through every matching business.
- **Failed logins (24h/7d)** counts unsuccessful login attempts with a valid phone/PIN shape. The event keeps only a reason and timestamp. It does not store an attempted phone number, PIN, IP address, or customer data. The counter begins when this migration is deployed; older attempts cannot be reconstructed.
- **Application errors** link to Sentry. Audit logs record successful actions, not failed HTTP responses, so they must not be interpreted as an error count.
- A section that fails to load shows its own error and Retry control. An unavailable section must not be read as zero activity.

## Data and release

Migration `20261003002000_admin_support_workspace` adds support assignees, follow-up dates, dated support notes, and anonymous login-failure events. Railway must apply it before the new backend starts. The migration does not remove existing business notes or payment records.

The new `/api/admin/operations-summary` and `/api/admin/support/*` endpoints require platform-admin authentication. A merchant or staff account must not be able to read support timelines or failed-login totals. Admin support updates and note additions are audit-logged without copying note text into audit metadata.

After deployment, verify an admin can load Overview, open Needs Action, search a test shop, add a note, assign an admin, set a due date, and see the note after a reload. Check Reports status totals and pagination. Check that a merchant session gets 403 on the new endpoints. Finally review Sentry and the production monitor.
