# Cash On Hand: Owner Guide

**Availability:** Cash on Hand is owner-only and feature-gated. It may not yet
appear in a business menu. Do not enable it for merchants until the migrations
and release checks in [`CASH_ON_HAND_DESIGN.md`](CASH_ON_HAND_DESIGN.md) are
complete.

## What It Tracks

Cash on Hand is a branch-specific record of physical business cash across
drawers and, where applicable, the business safe. It is not Merchant Balance,
sales revenue, profit, or a bank/mobile-money account. DukaPilot records where
the owner says cash went; it does not transfer money or verify an external
statement.

## Who Can Use It

Only the business owner can view the Cash on Hand balance and history, set its
mode, make the opening count, record owner movements, accept shift handovers,
or record a drawer transfer. Staff permissions such as Reports, Stock, or
Manage team shifts do not grant access. Staff continue to use their permitted
Daily Close workflow, but cannot see the owner's cash balance. Each view is
scoped to the selected branch.

## Choose a Tracking Mode

Every new mode and every mode change starts with a fresh physical count. Count
the cash covered by that mode; do not carry the previous displayed balance
forward as the new opening amount.

- **Automatic:** Count cash in every open drawer and the business safe. DukaPilot
  then adds or subtracts recorded cash transactions and owner-entered movements.
  Cash sales/collections, cash expenses, cash refunds, supplier cash payments,
  and their supported corrections are recorded from their source transactions.
  Non-cash payments and unpaid expense schedules do not move physical cash.
  Never enter one of these DukaPilot transactions again as a manual movement.
- **Handover:** The balance includes amounts the owner confirms receiving from
  closed shifts. Open drawers are not included until closed and handed over. If
  a handover is reversed, use its linked replacement flow for that shift rather
  than entering the cash as unrelated income.
- **Manual:** The owner records the opening count and every later cash change.
  Sales, expenses, payments, and shift closures are not added automatically in
  this mode.

If the business changes its tracking method, count the physical cash again and
confirm the new amount. Old periods remain in history; their transactions are
not imported into the new count.

## Daily Close and Drawer Transfers

Before counting a drawer, the owner can record cash removed from it and choose
the destination: business safe, bank, mobile money, or owner withdrawal. The
transfer cannot exceed that drawer's expected cash. Enter the amount removed,
then count the cash remaining in the drawer. Daily Close subtracts the transfer
once before calculating the shift variance.

- **Business safe:** This is an internal move. It leaves the drawer but remains
  part of business cash and can be included in a shift handover.
- **Bank, mobile money, or owner withdrawal:** This leaves tracked physical
  cash. The application records the destination but does not execute or verify
  the transfer.

Only the owner records this drawer transfer. A staff member may still close a
shift when permitted, but cannot claim that cash was transferred to a
destination on behalf of the owner.

## Corrections and Reversals

Cash-source events are linked to their original sale, expense, refund, supplier
payment, or correction. Correct the source transaction through its normal
workflow; do not reverse an automatically sourced movement by entering a second
manual movement. The ledger keeps linked correction history instead of
silently rewriting the old event. For owner-entered movements, use Reverse and
provide the reason. Check the source and movement history before retrying an
uncertain request so the same cash is not entered twice.

Cash at Daily Close and Cash on Hand answer different questions: Daily Close
reconciles one drawer for one shift; Cash on Hand follows the owner's total
physical cash under the selected mode. The same sale or expense must not be
manually added to both ledgers.

## What Changed From Before

Previously, DukaPilot's cash view was primarily the expected/counting balance
for an individual Daily Close shift. Cash on Hand adds a separate owner-only,
branch-specific ledger for cash across the business, with Automatic, Handover,
and Manual tracking choices, opening counts, movement history, linked
corrections, and explicit drawer-transfer destinations. It does not change how
profit is calculated, and it does not turn Merchant Balance into physical
cash.

## Explain It to a Business Owner

**English:** “Daily Close still checks the cash in each shift's drawer. Cash on
Hand is a separate owner-only view that helps you track the business's physical
cash across drawers and the safe. You choose Automatic, Handover, or Manual and
start with a fresh count. In Automatic mode, recorded cash sales, payments,
expenses, refunds, supplier settlements, and supported corrections update the
estimate, so you must not enter them a second time. At Daily Close, record cash
you actually remove and where it went; cash moved to the safe stays business
cash, while money taken to a bank/mobile wallet or withdrawn leaves the cash
total. DukaPilot records the movement but does not send money or check
statements. Staff cannot see or manage the owner's Cash on Hand balance.”

**Kiswahili:** “Daily Close bado hukagua fedha kwenye droo ya kila shift.
Fedha zilizopo ni sehemu tofauti ya mmiliki pekee ya kufuatilia fedha halisi za
biashara kwenye droo na salama. Unachagua Otomatiki, Makabidhiano au Kwa
mikono, kisha unaanza kwa kuhesabu fedha upya. Kwenye Otomatiki, mauzo ya
taslimu, makusanyo, matumizi yaliyolipwa, marejesho, malipo ya supplier na
marekebisho yanayoungwa mkono huingia kwenye makadirio; usiyaingize tena kama
rekodi za mikono. Kwenye Daily Close, rekodi tu fedha ulizotoa kweli na
ulipozipeleka. Zilizowekwa kwenye salama bado ni fedha za biashara; zilizopelekwa
benki/mobile money au kuchukuliwa na mmiliki hutoka kwenye jumla ya cash.
DukaPilot hurekodi mwendo huo lakini haitumi pesa wala kuhakiki statement.
Staff hawawezi kuona au kusimamia salio la mmiliki la Fedha zilizopo.”
