# DukaPilot Google Play Data Safety Record

Last reviewed: 2026-08-25

Owner: DukaPilot Privacy Owner, Necuva Group Limited

Public privacy policy: `https://www.dukapilot.com/privacy`

Public account deletion page: `https://www.dukapilot.com/delete-account`

This is the release checklist and source record for the DukaPilot Play Console
Data Safety form. It must be reviewed whenever the Android wrapper, an SDK, or
an external service changes. It is an implementation record, not legal advice.

## Core console answers

| Console question | Answer | Basis |
| --- | --- | --- |
| Does the app collect data? | Yes | Accounts and the merchant's business records are needed to provide the service. |
| Does the app share data with third parties? | Yes, conditionally | SMS, WhatsApp, error diagnostics, and hosting/storage providers receive the data needed to deliver their service. DukaPilot does not sell data or use advertising SDKs. |
| Is collected data encrypted in transit? | Yes | Production web/API traffic is served over HTTPS. |
| Can users request account deletion? | Yes | The public deletion page offers email and WhatsApp requests and explains verification, scope, completion, and retention. |

## Data categories to disclose

Use the Play Console wording that most closely matches the categories below.
Only mark a category as shared where the associated provider is enabled for the
release and receives that category.

| Data category | Examples in DukaPilot | Purpose | Shared outside DukaPilot |
| --- | --- | --- | --- |
| Personal info | Account name and phone; staff/customer/supplier names and phones entered by a merchant | Account management, shop operations, support | Conditional: NextSMS for verification SMS; WhatsApp when the merchant chooses contact/order messaging |
| Financial and business information | Sales, debts, expenses, product cost/price, payment references, receipts, subscription payment records | Merchant operations, reports, billing, support | Conditional: WhatsApp order messages if the shop enables sending them; hosting/storage provider processes service data |
| Location | Shop city, district, and address details entered by the merchant | Shop profile, supplier ordering, catalog display | Conditional: included in an order message when the merchant chooses to send it |
| App activity | `store_click`, `signup_started`, `trial_started`, `whatsapp_started`, each with an anonymous browser-session ID plus product/source/campaign | First-party conversion measurement | No advertising sharing; hosting/storage provider processes the events |
| Diagnostics | Error metadata from web/API failures | Reliability and security | Sentry when configured; `sendDefaultPii` is disabled and browser replay masks text and blocks media |
| Device or push data | Browser push subscription endpoint, cryptographic keys, and merchant-provided device label | Deliver opted-in notifications and troubleshoot delivery | Push service/provider receives the subscription necessary to deliver a notification |

Do not declare precise GPS location, contacts permissions, payment-card or bank
account data, health data, advertising identifiers, or ad-targeting data unless
a future release actually adds them.

## External services and flow boundaries

- **Railway / managed database and Vercel:** host, process, and store the
  service data required for DukaPilot.
- **NextSMS:** receives the recipient phone number and the verification message
  when PIN recovery/verification is used and the provider is configured.
- **WhatsApp:** receives the destination phone number and message content when a
  user chooses its deep link or a merchant enables WhatsApp order messages.
- **Sentry:** receives error diagnostics only when a Sentry DSN is configured.
  Do not attach merchant/customer/debt/expense data to error context.
- **Browser push services:** receive the endpoint and encrypted push payload
  required to deliver an opted-in alert.

## Deletion and retention answer

Users can request full account deletion or partial deletion without deleting the
account at `https://www.dukapilot.com/delete-account`. The support operator
verifies the account phone number and shop name, confirms the requested scope,
and records the result. Live account and shop data are deleted within 30 days of
a verified request. Limited security, audit, payment, tax, and request-
confirmation records may remain for up to 90 days, or longer where legally
required. System backups can take up to 90 days to age out. Messages delivered
through external providers remain subject to those providers' retention rules.

## Release review checklist

1. Compare the live privacy and deletion pages with this record.
2. Review Android dependencies and all enabled SDKs for new collection/sharing.
3. Confirm the HTTPS production URLs and deletion links load publicly.
4. Confirm Sentry has `sendDefaultPii: false` and browser replay masking.
5. Run one controlled deletion-request test and record it in
   `docs/DATA_DELETION_REQUEST_TEST.md`.
6. Update Play Console before submitting the release.

Google requires the Data Safety answers to match actual collection and sharing,
and requires account-creating apps to provide an accessible deletion path. See
[Google Play Data safety form](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
and [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
