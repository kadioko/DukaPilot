# WhatsApp Business App Coexistence

This runbook connects the existing DukaPilot WhatsApp Business App number to Meta Cloud API without deleting or deregistering the mobile app number. It is a platform-admin operation, not a merchant feature.

## What DukaPilot does

The admin **WhatsApp API** tab launches Facebook Login for Business with Meta's Business App coexistence selector:

```js
FB.login(callback, {
  config_id: META_CONFIG_ID,
  response_type: "code",
  override_default_response_type: true,
  extras: {
    setup: {},
    featureType: "whatsapp_business_app_onboarding",
  },
});
```

This is deliberately different from normal Cloud API signup. Do not use the generic **Add new number** route for an existing WhatsApp Business App number.

When Meta sends `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, DukaPilot sends the short-lived authorization code to its own backend. The backend exchanges it with Meta, discovers the phone from the WABA, and only confirms success when Meta reports both:

```json
{
  "is_on_biz_app": true,
  "platform_type": "CLOUD_API"
}
```

The authorization code and Meta access token are never returned to the browser, stored in DukaPilot, audit log, or application log.

## Meta prerequisites

1. The Meta app must be published and owned by the DukaPilot business.
2. The DukaPilot business must be Meta-verified.
3. The app must have a Facebook Login for Business configuration that Meta has enabled for WhatsApp Business App coexistence / Tech Provider or Solution Partner use.
4. Add that configuration ID to Vercel as `NEXT_PUBLIC_META_WHATSAPP_COEXISTENCE_CONFIG_ID`.
5. Add the Meta app ID to Vercel as `NEXT_PUBLIC_META_APP_ID`.
6. Add `META_APP_ID` and `META_APP_SECRET` to the Railway backend. Keep the app secret private.
7. In Meta's WhatsApp webhook configuration, subscribe to `history`, `smb_app_state_sync`, and `smb_message_echoes` in addition to the standard delivery fields. The endpoint is `https://dukapilotproduction.up.railway.app/api/webhooks/meta-whatsapp`.

`META_GRAPH_API_URL` may stay at `https://graph.facebook.com/v25.0` unless a newer supported Graph version is deliberately selected.

## Onboarding

1. In DukaPilot, sign in as a platform admin and open **Admin > WhatsApp API**.
2. Select **Connect existing WhatsApp Business app**.
3. Meta should show an existing-business-app connection screen, not only **Add new number**.
4. On the phone, complete Meta's official connection prompt and confirm the Business Platform connection.
5. Return to DukaPilot. It verifies the WABA and shows the phone ID only after coexistence is confirmed.
6. Add the verified production phone ID, a Meta system-user token, and the approved `dukapilot_pin_reset` template name to Railway's WhatsApp environment variables.
7. Test Forgot PIN using an existing DukaPilot account before making WhatsApp the default recovery method.

## If Meta still shows “Add new number”

Do not remove the number from WhatsApp Business and do not call the normal phone registration API. It means Meta is still running normal Cloud API signup. Check the Facebook Login for Business `config_id`, the `featureType` selector, and Meta's Tech Provider / Solution Partner eligibility before retrying.

## Security rules

- Never enter `META_APP_SECRET`, the Cloud API token, or a PIN reset code in Vercel browser settings, Git, support chat, or frontend code.
- Rotate any token that was pasted into chat.
- Do not enable `WHATSAPP_ENABLE_FREEFORM` merely because coexistence is connected. Business-initiated notifications still need the correct approved Meta template outside the customer-service window.
