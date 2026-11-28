# Services in POS

Owners and staff with stock-management permission can open Inventory > Services to add or edit a saved service such as a car wash. Enter a whole-TZS selling price; the service appears alongside products in Sales and can be added repeatedly or combined with stock items. A service has no inventory quantity and its sale, void, customer return and refund do not create stock movements. Existing payment, credit, cash shift and return rules still apply.

Services use the existing quotation service catalogue for the selected branch. Changing a service affects its future default price, not saved sales or quotation line snapshots. Currently a service uses the same listed price in retail and wholesale; the owner's existing checkout-price setting controls individual overrides. Services are not included in the product CSV, public product catalogue, barcode scanner, or individual product-performance screen. Analytics includes them as unlinked named sale lines; changing their name can split historical rankings by name.

Reports treat a zero estimated cost as unknown, not confirmed zero cost, and flag incomplete cost coverage. Enter a reasonable per-service estimate only when known. Do not count the same supplies once as that estimate and again as an operating expense when interpreting net profit. Updating an estimate does not recalculate old sales. Staff without Reports permission cannot see or change service cost; stock-only staff cannot access the services catalogue without an additional sales, price-view or stock-management permission.

Service creation has a retry ID while the form remains open. If the save response is lost, retry unchanged to avoid creating a duplicate. Check the services list before starting a new entry after closing or reloading the page.
