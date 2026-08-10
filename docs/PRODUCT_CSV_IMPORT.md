# Product CSV Import

Use **Inventory > Import CSV** when you already have a product list in Excel or Google Sheets.

1. Select **Download CSV template**.
2. Open it in Excel or Google Sheets.
3. Add one product per row.
4. Save or download the sheet as **CSV**.
5. Select the CSV file in DukaPilot and choose **Import products**.

The required columns are `name`, `buyingPrice`, and `sellingPrice`. Prices must be whole TZS amounts. The template also includes optional `sku`, `unit`, `currentStock`, `minimumStock`, `barcode`, `expiryDate`, and `doesNotExpire` columns.

Leave optional cells blank when they do not apply. DukaPilot uses opening stock `0` and minimum stock `5` when those values are blank. For a product with an expiry date, write it as `YYYY-MM-DD`, for example `2026-12-31`. Use `true` in `doesNotExpire` for items that never expire.

Each import accepts up to 200 products. DukaPilot checks every row before adding anything; if there is an error, correct the stated row and import the file again. Opening stock added by import is recorded in stock history.
