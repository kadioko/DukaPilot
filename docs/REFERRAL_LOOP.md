# DukaPilot Referral Loop

The referral loop turns every activated merchant into two warm introductions, with a tracked in-product reward path.

## When To Ask

Ask only after a merchant has seen value.

Best moments:

- After they add 10 products.
- After they record 10 sales.
- After they return on a second day.
- After you help them solve a real stock, debt, or supplier-order problem.

Do not ask immediately after signup unless they already know other shop owners who asked about DukaPilot.

## Referral Offer

Launch offer:

- Referrer gets 1 free week after the referred shop records 10 real sales.
- Referred shop gets free setup help.

Each merchant's referral page has a unique link that opens the registration form directly. When a new merchant completes registration through it, DukaPilot records the referrer and the new shop automatically. The invite is retained in the browser for up to 30 days, and successful registrations record the referrer in the audit trail.

The registration, shop creation, and referral record are one database transaction. A partial failure rolls all of them back rather than creating a merchant account without its referral. Referral histories are paginated in both the merchant and Admin views, so older valid referrals remain accessible as the list grows.

## Merchant Share Message

Swahili:

> Use the personal link created in the merchant's onboarding checklist. It includes the tracking code automatically.

English:

> Use the personal link created in the merchant's onboarding checklist. It includes the tracking code automatically.

## Founder Ask Script

Swahili:

> Una marafiki wawili wenye maduka ambao wanaandika mauzo au stock kwenye daftari? Ukituma hii link, tukiwasaidia wakirekodi mauzo 10, tutakuongezea wiki 1 bure.

English:

> Do you know two shop owners who still track sales or stock in a notebook? If you share this link and they record 10 sales, we will add 1 free week to your shop.

## Admin Workflow

In Admin -> Referrals:

- Review the referrer, new shop, contact details, and completed-sale progress.
- The record moves to `QUALIFIED` after the new shop has 10 completed sales.
- Select `Reward 7 days` to extend the referrer's active paid subscription or free-trial validity. The action is audited and cannot be granted twice.
- Select `Not valid` only for a mistaken or fraudulent referral; this permanently closes the reward.
- If a genuine registration was missed, use **Recover missing referral** with the referrer's code, the new owner phone number, and a short evidence note. This creates one audited referral record and still applies the normal 10-completed-sale rule before a reward can be granted.
