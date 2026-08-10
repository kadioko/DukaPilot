# NextSMS PIN Recovery Setup

DukaPilot sends a six-digit SMS code when an owner or active staff member selects **Forgot PIN?**. The code expires after 10 minutes, can be used once, and accepts at most five incorrect attempts.

## Railway variables

In Railway production, add these variables to the DukaPilot service:

| Variable | Value |
| --- | --- |
| `SMS_PROVIDER` | `NEXTSMS` |
| `NEXTSMS_API_KEY` | The secret bearer token from NextSMS **Customer Info > Customization > API Keys** |
| `NEXTSMS_SENDER_ID` | The exact approved sender ID shown in NextSMS. Current approved value: `Dukapilot` |
| `NEXTSMS_API_URL` | `https://messaging-service.co.tz/api/sms/v2/text/single` |

Do not put the API key in Git, a frontend variable, or a support message. Adding/changing the variable redeploys Railway automatically.

## Test after deployment

1. Use a real DukaPilot owner or active staff phone number that you control.
2. On the sign-in page, select **Forgot PIN?**.
3. Enter the phone number in `07...`, `255...`, or `+255...` form.
4. Confirm the SMS appears with the approved DukaPilot sender name.
5. Enter the six-digit code and a new 4-8 digit PIN.
6. Sign in with the new PIN.

The application uses the documented NextSMS bearer-authenticated Internet SMS endpoint and sends Tanzanian numbers as digits beginning with `255`. Provider errors are kept out of the customer-facing response to avoid exposing account details or whether a phone number exists.
