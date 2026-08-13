# Product CSV Import

Use **Inventory > Import CSV** when you already have a product list in Excel or Google Sheets.

1. Select **Download CSV template**.
2. Open it in Excel or Google Sheets.
3. Add one product per row.
4. Save or download the sheet as **CSV**.
5. Select the CSV file in DukaPilot and choose **Import products**.

The required columns are `name`, `buyingPrice`, and `sellingPrice`. Prices must be whole TZS amounts. You can write a price as `12500`, `12,500`, `12 500`, or `TZS 12,500`; DukaPilot reads all four as TZS 12,500. The template also includes optional `sku`, `unit`, `currentStock`, `minimumStock`, `barcode`, `expiryDate`, and `doesNotExpire` columns.

Wholesale is explicitly **off by default** for every imported product. To enable it for one product, use these optional columns:

| Column | Use |
| --- | --- |
| `wholesaleEnabled` | Leave blank or use `false` to keep wholesale off. Use `true` only for a product that has a wholesale price. |
| `wholesalePrice` | Required when `wholesaleEnabled` is `true`. It must be a whole TZS amount and cannot be higher than `sellingPrice`. |
| `wholesaleMinQty` | Optional when wholesale is enabled. This is the smallest quantity sold at the wholesale price. If blank, DukaPilot uses `5`. |

For example: `Mchele 1kg,MCH001,kg,2200,2800,20,5,,,true,true,2500,5`. Do not enter a wholesale price while `wholesaleEnabled` is blank or `false`; DukaPilot will show a row error so a retail-only product cannot accidentally get a wholesale price.

Leave optional cells blank when they do not apply. DukaPilot uses opening stock `0` and minimum stock `5` when those values are blank. For a product with an expiry date, write it as `YYYY-MM-DD`, for example `2026-12-31`. Use `true` in `doesNotExpire` for items that never expire.

Each import accepts up to 200 products. DukaPilot checks every row before adding anything, so a partially wrong file never creates only some products. If there is an error, the import window shows the row number, column, and reason. Common corrections are adding a missing `buyingPrice`, and making sure `wholesalePrice` is not higher than `sellingPrice`. Opening stock added by import is recorded in stock history.
