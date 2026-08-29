# DukaPilot Staff Access Guide

When an owner adds a staff member, they enter the staff member's phone number. Tanzania formats `07...`, `255...`, and `+255...` all work. If no PIN is entered, the first PIN is `1234`. The staff member should sign in and change it immediately in **Settings > Change PIN**.

## Plan limit

- **Basic:** one active staff member in addition to the owner. Deactivate that staff account before activating or adding a different one.
- **Pro:** unlimited active staff members.
- The 14-day trial includes the Pro staff capability.

## Roles

| Role | Default access | Best for |
| --- | --- | --- |
| Owner | Sales, stock, staff, reports, expenses | A trusted senior person running the whole shop |
| Manager | Sales, stock, staff, reports, expenses | Day-to-day shop manager |
| Cashier | Sales, POS, their own Daily Close session when Sell is enabled | Counter cashier |
| Stock Clerk | Inventory, Receive Stock, barcode labels, stock count | Storekeeper or stock assistant |

The owner can fine-tune permissions per individual after creating them. Deactivating a staff member immediately blocks their next authenticated request and future login.

## Cashier Daily Close

When a cashier has **Sell** permission, they can open a Daily Close cash session, record the opening cash, and close only their own session. DukaPilot reconciles that session's cash sales, cash debt collections, and cash expenses against the amount they count in the drawer. A cashier cannot close another staff member's session. Owners can review every session for the day.

Cashiers without **Reports** still do not receive buying cost, profit, margin, or shop-wide financial analytics.

## AI Assistant (Pro)

On an active **Pro** plan, the owner can tick **Use AI Assistant** for each individual staff member. It is off by default and does not grant any other permission.

- Owners and staff with **Reports** can receive the full business AI view.
- A Stock Clerk with AI can receive stock-only prompts, without sales, buying prices, profit, debts, or expense data.
- A Cashier with AI receives only safe POS guidance. They cannot see sales amounts, profit, debts, expenses, or business performance unless the owner separately grants **Reports**.

Turning off the AI tick removes the Assistant from that staff member's navigation and blocks the AI API immediately on their next request.

## Share With Staff

"Open dukapilot.com and log in with your phone number. You can write it as 07..., 255..., or +255.... Your first PIN is 1234 unless the shop owner gave you another PIN. After logging in, open Settings and change your PIN."
