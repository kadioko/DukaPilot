# Product Promotions and Staff Login Removal

## Scheduled product promotions

Shop owners can schedule one retail promotion per product from Inventory. Set a whole-TZS promotion price below the regular selling price, then choose the start and end date/time. The input uses the device's local time. The regular price remains saved as the reference price; the promotion is active from its start time up to, but not including, its end time.

The active retail price is used by the POS and public catalog/catalog orders. Wholesale prices are not changed. Existing completed sale and customer-order line prices remain snapshots and are not rewritten when a promotion is edited or ends. Staff cannot create or edit scheduled offers. Internal-use products cannot have promotions. To remove an offer early, clear its price and both dates in the product editor.

Use a scheduled promotion for a public offer over a time window. Use the existing checkout price-change setting for an individually negotiated price on a single transaction.

The start and end values are entered in the owner's device-local time and saved
as timestamps. Confirm the device timezone before scheduling an offer. The end
time is exclusive: the regular price resumes at that exact time.

## Staff removal

Deactivate a staff account first, then use **Delete login** and confirm the browser prompt. This immediately removes the staff member's phone/PIN login and frees the phone number for reassignment. The staff record is retained without login credentials so historical sales and shifts remain correctly attributed for audit and reports. This is intentionally not a destructive deletion of the business history.

## Release gate

Scheduled promotions require Prisma migration
`20261006001000_scheduled_product_promotions`. Apply the repository migrations
to Railway and deploy the backend before serving the matching frontend. Purchase
analytics and stock-history pages read existing receipt/movement data and need
no new schema migration. Documentation describes the workspace implementation;
it is not proof that production has deployed it.
