# WhatsApp PIN Recovery

DukaPilot lets a user choose **SMS** or **WhatsApp** after selecting **Forgot PIN?**. Both channels create the same six-digit, hashed, single-use code. It expires after 10 minutes, permits five incorrect attempts, and is throttled by both the API and a one-minute resend cooldown.

WhatsApp PIN recovery is intentionally template-only. A business cannot reliably start a WhatsApp conversation with normal text outside the customer-service window, so the reset code is delivered with one approved Meta template.

## Meta setup

In **WhatsApp Manager**, select the production account for the DukaPilot number, not the test account. Create an **Authentication** template with:

| Field | Value |
| --- | --- |
| Name | `dukapilot_pin_reset` |
| Category | Authentication |
| Type | One-time Passcode |
| Language | English (`en_US`) |
| Delivery | Copy code |
| Validity | 10 minutes |

Meta owns the fixed authentication copy (for example, `{{1}} is your verification code`), so there is no custom message body to enter. Do not add a customer name, PIN, business data, debt balance, or promotional text. Wait until Meta marks the template as active/approved before enabling WhatsApp recovery.

### Production-number prerequisite

The production number must be **registered and Online for Cloud API** in the same WhatsApp Business Account before it can create templates or send messages. A number that appears in WhatsApp Manager as **Offline**, or an app setup page that says **No phone numbers available for this app**, is not ready even when webhooks, payment, app publication, and business verification are complete.

For an existing WhatsApp Business App number, use DukaPilot's **Admin > WhatsApp API** coexistence flow. It launches Meta Embedded Signup with the Business App selector and confirms that the same number is both `is_on_biz_app: true` and `platform_type: CLOUD_API`. Do not use Meta's generic **Add new number** or normal phone-registration route. The full platform setup is in [WHATSAPP_BUSINESS_APP_COEXISTENCE.md](WHATSAPP_BUSINESS_APP_COEXISTENCE.md).

## Railway production variables

Add these to the backend service only:

| Variable | Value |
| --- | --- |
| `WHATSAPP_API_URL` | `https://graph.facebook.com/v23.0` |
| `WHATSAPP_API_TOKEN` | Meta system-user access token; secret |
| `WHATSAPP_PHONE_ID` | Production WhatsApp phone number ID; secret configuration |
| `WHATSAPP_OTP_TEMPLATE` | `dukapilot_pin_reset` |
| `WHATSAPP_OTP_TEMPLATE_LANGUAGE` | `en_US` |
| `WHATSAPP_ENABLE_FREEFORM` | `false` |

The token must never be placed in Vercel, browser code, Git, logs, support chat, or a local committed file. Rotate any token that was pasted into a chat after this setup is verified.

## Test checklist

1. Confirm the template is approved and the Railway deployment is healthy.
2. Use an existing DukaPilot owner or active staff number you control.
3. Open **Forgot PIN?**, select **WhatsApp**, enter the phone in `07...`, `255...`, or `+255...` form, and request a code.
4. Confirm the reset code arrives from the production business number.
5. Enter the code, choose a new 4-8 digit PIN, and sign in successfully.
6. Repeat with **SMS** to prove the existing fallback still works.

The public response is intentionally generic whether or not an account exists. This prevents the reset endpoint from becoming an account-discovery tool. Meta delivery callbacks are signature-validated at `/api/webhooks/meta-whatsapp`; do not log webhook payloads, recipient phone numbers, or OTPs.

## Appropriate WhatsApp use

Use templates for expected, opt-in operational messages: PIN recovery, subscription renewal reminders, quotation expiry/deposit reminders, and owner notifications where a template has been approved. DukaPilot keeps free-form Cloud API sending disabled by default, because Meta only permits it within a customer-initiated 24-hour service window. Keep supplier orders, receipts, and customer conversations on user-triggered WhatsApp share links unless the recipient has explicitly opted in and an appropriate template exists. Do not use WhatsApp to send promotional blasts, sensitive financial details, or debt reminders without consent.
