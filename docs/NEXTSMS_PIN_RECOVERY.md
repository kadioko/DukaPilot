# NextSMS PIN Recovery And Monitoring

DukaPilot sends a six-digit SMS code when an owner or active staff member selects **Forgot PIN?**. The code expires after 10 minutes, can be used once, and accepts at most five incorrect attempts. Login and recovery accept Tanzanian numbers in `07...`, `255...`, and `+255...` form.

## Railway variables

In Railway production, add these variables to the DukaPilot service:

| Variable | Value |
| --- | --- |
| `SMS_PROVIDER` | `NEXTSMS` |
| `NEXTSMS_API_KEY` | The secret bearer token from NextSMS **Customer Info > Customization > API Keys** |
| `NEXTSMS_SENDER_ID` | The exact approved sender ID shown in NextSMS. Current approved value: `Dukapilot` |
| `NEXTSMS_API_URL` | `https://messaging-service.co.tz/api/sms/v2/text/single` |
| `NEXTSMS_MONITOR_BASE_URL` | Optional. Defaults to `https://messaging-service.co.tz/api/v2` for platform-admin balance and delivery monitoring. |

Do not put the API key in Git, a frontend variable, or a support message. Adding/changing the variable redeploys Railway automatically.

## Test after deployment

1. Use a real DukaPilot owner or active staff phone number that you control. Create a temporary trial merchant first when testing a new number.
2. On the sign-in page, select **Forgot PIN?**.
3. Enter the phone number in `07...`, `255...`, or `+255...` form.
4. Confirm the SMS appears with the approved `Dukapilot` sender name.
5. Enter the six-digit code and a new 4-8 digit PIN.
6. Sign in with the new PIN.

The application uses the documented NextSMS bearer-authenticated Internet SMS endpoint and sends Tanzanian numbers as digits beginning with `255`. Provider errors are kept out of the customer-facing response to avoid exposing account details or whether a phone number exists. Do not record test phone numbers, OTP codes, API keys, or temporary PINs in Git, docs, or support notes.

## Platform-admin monitoring

Only DukaPilot platform accounts with the `ADMIN` role can open **Admin Dashboard > SMS**. The tab calls the provider's read-only balance and delivery-report endpoints and shows up to 100 recent delivery records. Recipient numbers are masked and SMS body text is never returned or stored, so PIN reset codes cannot be viewed by an administrator.

The backend routes are protected by `requireRole("ADMIN")`; merchant owners, suppliers, managers, and cashiers receive `403` even if they call the endpoint directly. The monitoring endpoint is cached for one minute, coalesces simultaneous reads, and allows a provider refresh at most once every 15 seconds to avoid NextSMS rate limiting. A temporary provider error serves the latest successful snapshot when one exists.

NextSMS report data is a provider-maintained recent feed, not DukaPilot's permanent message archive. For a long-term operational audit, add a DukaPilot-owned delivery log before relying on the provider feed as the sole history.
