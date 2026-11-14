# Cash On Hand: Implementation Design

Status: production code and database migrations are deployed. Cash On Hand is
owner-only and controlled by two production gates. The owner API and screen
support counted periods, manual movements, closed-shift handovers, linked
reversals, and one replacement handover after a reversal. Daily Close records
cash removed from a drawer and its destination; it subtracts the amount from
expected drawer cash once. Cash moved to the business safe remains eligible
for handover. Transactional cash-source hooks cover cash sales, debt and
quotation collections/refunds, customer refunds/recoveries, expenses and
corrections, supplier settlements/refunds/receipt corrections, stock receipts,
direct production costs, and external drawer transfers.

For merchant-facing instructions and bilingual customer wording, see
[`CASH_ON_HAND_GUIDE.md`](CASH_ON_HAND_GUIDE.md). The Help center includes
short English and Kiswahili answers and hides the Cash on Hand page link until
the frontend feature gate is enabled.

Automatic mode and manual adjustments within it are available only behind the
feature gates. Production activation requires both
`CASH_HOLDING_ENABLED=true` on the Railway API service and
`NEXT_PUBLIC_CASH_HOLDING_ENABLED=true` on the Vercel production build. Rebuild
the frontend after changing its public flag. Backend source hooks return
without querying the new tables while `CASH_HOLDING_ENABLED` is off. If the
frontend is enabled while the backend gate is off, the page cannot load its
data.

The following migrations must be applied before deploying a backend version
that uses the new Daily Close columns or enabling the cash-on-hand API:

- `20261114001000_cash_holding_foundation`
- `20261114002000_cash_handover_reentry`
- `20261114003000_daily_close_cash_transfers`

Owner-only routes are `/api/cash-holding`, `/handovers`, `/count`, and
`/movements`, scoped to the selected shop or branch. Staff are denied even if
they have reports or cash-session permissions. If an uncertain request is
retried, the screen reuses its key while its same-tab session storage remains
available. If storage is unavailable or lost, inspect movement history before
entering the amount again.

## Purpose

Provide an owner-only, branch-scoped record of physical business cash. It is
separate from DukaPilot Merchant Balance and does not transfer money or verify
bank or mobile-money statements. Record owner withdrawals, deposits, other
cash received, shift handovers, and corrections with an audit trail. These
movements must not themselves be treated as sales or operating expenses.

## Tracking Modes

Changing modes requires a fresh physical count and retains the effective time
and actor. Never copy the previous mode balance automatically.

- **Automatic:** Estimates cash across open drawers and the business safe from
  a confirmed opening count and subsequent recorded cash events. The opening
  count must include all open drawers and the safe. Do not add opening floats,
  drawer counts, or handovers as new income. Do not enter a sale, expense, or
  payment manually if it is already recorded in DukaPilot.
- **Handover:** The owner confirms an amount received from a closed shift. The
  amount can be partial. If the handover is reversed, one linked replacement
  can be recorded. Cash moved to the business safe before drawer counting is
  included in the maximum eligible handover amount. A bank, mobile-money, or
  owner-withdrawal destination is not eligible for that handover.
- **Manual:** The owner records an opening count and subsequent movements.
  Sales, expenses, and shift closures do not automatically change this mode's
  balance.

In Handover mode the balance describes amounts the owner has explicitly
accepted, not cash still in an open drawer. In Manual mode, the owner records
all balance changes. Daily Close transfer details are a record only: a safe
transfer is internal, while bank/mobile-money/owner destinations leave drawer
cash. The application does not confirm an external transfer.

## Cash Events And Corrections

Cash-source hooks run inside the same database transaction as the source
transaction. Credit and non-cash transactions, unpaid schedules, and inventory
consumption are not cash events. Existing cash sessions continue to calculate
drawer expected cash independently; cash-on-hand events must not be added to a
shift a second time. Quotation conversion does not create another receipt.

Actual dated expenses and supplier payments use their recorded payment dates.
An event before the current counted period is not replayed into its balance.
Later edits, deletions, reversals, receipt-payment corrections, and refund
recoveries are append-only linked events; never rewrite a past count. A change
to a report date is not itself proof that cash physically moved. A fresh
physical count is the boundary for later corrections: editing or reversing a
source transaction from a closed period does not rewrite the new period's
opening balance. If money actually enters or leaves after that count, record
the actual collection, refund, or owner movement in the active period. The
PostgreSQL regression suite verifies this boundary and a post-count cash refund.

Mode changes and source-event writes serialize on the active epoch row. A
period switch closes the previous epoch and starts the next from a fresh
physical count; historical source events are not imported into the new period.
Show physical-count differences and negative estimates clearly. Owner drawings
are cash movements, not operating expenses or changes to profit.

## Daily Close

An owner may record the amount physically removed from a drawer before the
count and select **Business safe**, **Bank**, **Mobile money**, or **Owner took
cash**. The amount must be no greater than the drawer's expected cash and is
subtracted once before variance is calculated. For an internal safe transfer,
the remaining drawer count plus that transfer can be handed over. The external
destinations are tracked as outflows only; DukaPilot does not execute them or
verify statements. Staff cannot submit a drawer transfer.

## Verification And Rollout

Release checks completed on 2026-11-14 using isolated test infrastructure:

- Backend unit suite: 381 passed, including owner-only access, controller hook
  contracts, cash event signs/corrections, and Daily Close transfer rules.
- PostgreSQL integrity suite: 26 passed against a disposable local database
  after all 78 migrations were applied, including duplicate-event and
  concurrent movement checks, branch isolation, handover replacement, and a
  signed-event matrix for sales, collections, refunds, purchases, costs, and
  drawer transfers.
- Production-build browser suite: 10 passed with API mocks, covering all three
  modes, safe retry after a lost response, mobile width, and a bank transfer
  during Daily Close.

No real merchant payment, cash movement, or physical drawer count was made.
Each business must start its own epoch with a fresh physical count. Earlier
transactions are not imported into that count; Automatic mode estimates only
from the confirmed opening count and subsequent supported cash events. Review
the first owner-entered count and the first Daily Close reconciliation with the
business before relying on the estimate operationally.
