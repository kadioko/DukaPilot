# Launch Quality Plan

## Shipped in this release

- Redirect an authenticated merchant from `/` to the correct working area.
- Stop the service worker from caching HTML navigation shells.
- Make animated headings accessible, searchable as complete strings, and free from per-letter clipping.
- Sync the document language with the selected Kiswahili or English interface and declare both language alternatives.
- Add registration PIN confirmation, Terms/Privacy consent, autofill hints, optional shop details, and a usable PIN visibility control.
- Place pricing before payment instructions and state that AI Assistant is a Pro feature.
- Add HSTS and a JSON response for unknown API routes.
- Activate backend Sentry on Railway, create high-priority founder email alerts, and complete a real alert drill.
- Activate frontend browser and Next.js server Sentry monitoring through Vercel production variables.
- Clarify dashboard time windows, zero-value charts, and all-time fallback states.
- Distinguish low stock from out of stock in dashboard alerts and counts.
- Repair Tanzania WhatsApp debt reminders, include the shop name, add debt age, labelled fields, and an optional due date.
- Add credit-sale due dates and cash change calculation.
- Group navigation with AI Assistant near the top and translate the barcode entry in Kiswahili.
- Correct zero-stock AI wording and format the WhatsApp summary for copying.
- Connect production PIN recovery to NextSMS, accept Tanzania `07...` and `+255...` phone formats, and verify a complete owner reset flow.
- Add platform-admin-only NextSMS monitoring for current SMS credits and recent delivery metadata, without exposing OTP content or full recipient numbers.
- Add Daily Close / Z-report, landed-cost Receive Stock, shareable receipt files, Bluetooth-printer print path, and visible QR ordering.

## Next: verify with real merchants

1. Replace placeholder social proof with two or three approved, named merchant testimonials and product screenshots. Do not invent endorsements.
2. Test registration, login redirect, POS, credit sale, and WhatsApp debt reminder on Android Chrome with a real Tanzania phone number.
3. Run PageSpeed Insights and a throttled mobile test; track FCP, LCP, and page weight before changing imagery or loading strategy.
4. Configure the Vercel toolbar so it is disabled for production, then verify from an incognito browser.
5. Have Tanzanian counsel review the Terms, Privacy Policy, consent wording, retention, and support process under the Personal Data Protection Act 2022.
6. Decide whether to persist a DukaPilot-owned long-term SMS delivery audit. NextSMS provides a recent report feed, but it should not be the only source of historical delivery evidence.

## Next: product decisions

1. Define a separate POS-only permission if cashiers must not see sales history, debt totals, or customer orders.
2. Add customer lookup/autocomplete and merge rules for repeat credit customers.
3. Validate Daily Close and Receive Stock with 20-30 active single-shop merchants before expanding the accounting model.
4. Rank AI stock actions by recent sales velocity and margin contribution, not only stock level.
5. Decide whether expired products should be hidden in POS or shown as blocked with a clear explanation.
6. Keep multi-branch as a Pro roadmap until real merchants show the branch, transfer, and reporting workflows they need.

## Next: usability polish

1. Make inventory restock a labelled primary action and place destructive delete actions behind a confirmation/overflow action.
2. Show currency profit per unit beside margin percent in inventory.
3. Add an explicit renewal date and tap-to-copy controls on Billing.
4. Add a dated source note below competitor prices and review them quarterly.
5. Apply the labelled-field pattern to remaining forms, especially expenses, supplier orders, and settings-adjacent workflows.
