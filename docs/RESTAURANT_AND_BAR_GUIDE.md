# Restaurant and Bar Guide

The **Andaa Chakula / Prepare Food** menu is shown only when the shop category in **Settings** is set to **Bar** or **Restaurant**. Other businesses can still read this guide in Help, but their everyday navigation stays focused on normal inventory.

## Food preparation and bar stock

Use DukaPilot's normal inventory for packaged bar products such as beer bottles, soft drinks, water, cans, and spirits. Give each item a barcode where available and receive it with its true buying price.

For prepared food, use normal inventory for ingredients and create a separate product for the portion that customers buy. Examples:

| What is sold | Product name | Unit | How stock is received |
| --- | --- | --- | --- |
| Half grilled chicken | Kuku nusu | nusu ya kuku | Created by a food preparation batch |
| Quarter chicken | Kuku robo | robo ya kuku | One whole chicken becomes four stock units |
| A prepared plate | Wali na kuku | plate | Receive prepared plates ready for sale |
| A poured drink | Glass ya wine | glass | Receive the number of sellable glasses |

The unit is shown in stock, POS, receipts, supplier receiving, and low-stock messages. **Andaa Chakula** is the step that converts ingredients into portions and deducts their stock.

## Recording a whole chicken sold in halves

1. In **Inventory**, create `Kuku mzima` with unit `kuku mzima`, and create a separate sellable item called `Kuku nusu` with unit `nusu ya kuku`.
2. In **Receive Stock**, receive 10 `Kuku mzima` at TZS 18,000 each. Add oil, spices, charcoal, and other ingredients as their own products and receive them too.
3. Open **Andaa Chakula**, choose `Kuku nusu` as the prepared item, then add the ingredients actually used.
4. Set expected yield to 20 and actual yield to 18 if two portions were lost in cooking. Add direct cooking costs such as charcoal or labour where relevant.
5. Save the batch. DukaPilot deducts ingredient stock, adds 18 `Kuku nusu` to stock, records waste of 2 portions, and calculates the actual cost per half.
6. Sell `Kuku nusu` in POS. Each sale removes one half chicken and uses the batch cost for profit reporting.

## Saved recipes

Use **Save as a reusable recipe** when the same meal is made regularly. A recipe stores its usual ingredients and expected yield, but does not change stock. Every day, choose the recipe in **Andaa Chakula** and record the actual yield. This keeps different days, waste, and ingredient costs honest.

## Grocery receipts where only the total is known

In **Receive Stock**, tick **I only know the total grocery bill**. Enter the total receipt amount and the quantities received. DukaPilot allocates the cost using each product's most recent buying price; if there is no price history, it uses quantities. The receipt is marked **estimated costs** so staff know to correct item prices later if the supplier provides them.

## Food purchases versus expenses

Use **Receive Stock** for food and stock inputs: chicken, oil, rice, spices, vegetables, charcoal, and drinks. This establishes their buying cost and keeps a stock history. Use **Andaa Chakula** to convert the ingredients into prepared portions.

Use **Expenses** for operating costs: rent, electricity, data, salaries, transport not already included in a stock receipt, and repairs.

Do not record a chicken purchase in both places. Recording it as a normal expense and then selling the chicken would count the cost twice in profit reporting.

## Important limits

Food preparation batches are intentionally immutable after saving. If staff make a mistake, use a stock adjustment with a clear note, then prepare a corrected batch. This preserves the audit trail instead of rewriting past stock history.

Packaged drinks, bottles, cans, and barcode products do not need food preparation. Continue receiving and selling them through the normal inventory flow.
