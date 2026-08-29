# Restaurant and Bar Guide

## What works today

Use DukaPilot's normal inventory for packaged bar products such as beer bottles, soft drinks, water, cans, and spirits. Give each item a barcode where available and receive it with its true buying price.

For prepared food, track the unit that is actually sold. Examples:

| What is sold | Product name | Unit | How stock is received |
| --- | --- | --- | --- |
| Half grilled chicken | Kuku nusu | nusu ya kuku | One whole chicken becomes two stock units |
| Quarter chicken | Kuku robo | robo ya kuku | One whole chicken becomes four stock units |
| A prepared plate | Wali na kuku | plate | Receive prepared plates ready for sale |
| A poured drink | Glass ya wine | glass | Receive the number of sellable glasses |

The unit is shown in stock, POS, receipts, supplier receiving, and low-stock messages. It does not convert whole chickens into portions or deduct ingredients automatically.

## Recording a whole chicken sold in halves

1. In **Inventory**, create `Kuku nusu` with unit `nusu ya kuku`.
2. If one whole chicken costs TZS 18,000, set the buying price for `Kuku nusu` to TZS 9,000.
3. In **Receive Stock**, when 10 whole chickens arrive, receive 20 `nusu ya kuku` units at TZS 9,000 each.
4. When a customer buys one half chicken, sell one `Kuku nusu` in POS. DukaPilot deducts one portion and calculates profit from the TZS 9,000 cost.

## Food purchases versus expenses

Use **Receive Stock** for food and stock inputs: chicken, oil, rice, spices, vegetables, charcoal, and drinks. This establishes their buying cost and keeps a stock history.

Use **Expenses** for operating costs: rent, electricity, data, salaries, transport not already included in a stock receipt, and repairs.

Do not record a chicken purchase in both places. Recording it as a normal expense and then selling the chicken would count the cost twice in profit reporting.

## Next planned capability

The recommended next restaurant feature is **Food Preparation**: record actual ingredients used, expected and actual portions produced, cooking loss/waste, and the resulting cost per prepared menu item. This will allow DukaPilot to deduct ingredients only when the kitchen prepares food, not merely when a meal is sold.
