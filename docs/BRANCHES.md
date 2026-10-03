# Branches and shared Pro billing

Pro includes four locations in total (main shop plus three). Extra locations cost
TZS 10,000/month each, added to the TZS 35,000 Pro subscription. Basic remains one
location. Extra slots are purchased, not granted by creating a branch.

## Owner workflow

Open Branches, add a name and location, then Open the location. Create products
and staff while that location is selected. Staff log in directly to their assigned
location and cannot switch. Each location has independent stock, sales, customers,
debts, quotations, orders, recipes, farm production and Daily Close records.
The owner can view a combined monthly sales/profit/expense summary in Branches.
Receivables there are current balances, not period cash collection.

The owner uses one account and one login phone to switch among locations. Customer
contact numbers are separate from login identities. Each location may set an optional
contact phone in Branches; a blank main-shop value falls back to the owner's account
phone, while a blank branch value inherits the main shop's contact. The resolved
number appears on that location's public catalog, WhatsApp order links/notifications,
and customer-facing quotations. Updating it never changes the owner or staff login.

Transfers require existing source and destination products with matching units and
expiry treatment. They atomically move stock, preserve a cost snapshot and create
both stock-history entries. Destination cost is quantity-weighted and rounded to
whole TZS. A transfer is neither revenue nor an expense and does not move cash.
Identical retries reuse the transfer; changed requests with the same key fail.

Sync pending offline sales before switching. Close open Daily Close sessions before
archiving a location. Archive retains records. Archive excess locations before
downgrading or reducing purchased slots. Archived locations stop public ordering.

## Billing

Renewal charges the base plan plus all selected extra slots. Mid-cycle branch
additions use a 30-day prorating basis, rounded up to whole TZS, until the existing
expiry. They do not extend that expiry. All locations share the main subscription.
Manual payments require an administrator to verify the reference, payment purpose,
amount and total extra slots. Online payments require provider verification; a
pending or mismatched payment grants nothing. Changed payment context goes to review.

## Architecture and migration

Shop remains the operational tenant boundary. The original Shop is the business
root. Child shops reference parentShopId. Authorization resolves the current plan,
trial, paid-through date, and suspension state directly from that root on every
request; copied child billing fields are not trusted. Branch archival is enforced
separately, so an archived branch remains unavailable even when the root is paid.
No existing sales or stock are reassigned.
Owner requests use X-DukaPilot-Branch, checked server-side against ownership.
Staff access is fixed to StaffMember.shopId. Billing always resolves the root.
Product barcodes are unique within a location so branches can stock the same item.

Apply the ordered Prisma migration history with backend `npm run db:deploy`.
The branch contact number is added by `20261003001000_branch_contact_phone`.
Deploy the backend migration before serving the updated frontend. Back up first
and test migrations on a restored staging DB.
Do not reverse the nullable owner field after creating branches; roll forward.
No new branch environment variables are required.

## Release checks

- Run backend tests, branches.unit.test.js and ntzs.unit.test.js.
- Validate/generate Prisma and typecheck/build the frontend.
- On a restored DB, verify main records remain unchanged and both migrations apply.
- Create four total locations; verify a fifth is blocked until confirmed payment.
- Attempt cross-business header and product access; verify rejection.
- Verify staff login, own-location permissions and rejection of location switching.
- Transfer twice with one request key; verify only one stock movement pair.
- Renew root and verify children share expiry; suspend root and verify child writes stop.
- Test archived public catalogs and owner access to retained records.
- Check browser flow on desktop/mobile and the existing single-shop sales flow.

Limitations: one branch per staff login; no in-transit transfer/approval lifecycle,
automatic product synchronization or consolidated accounting statements. Migration
and live provider completion must be verified before claiming production readiness.
