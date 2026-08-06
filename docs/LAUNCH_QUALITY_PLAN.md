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
- Clarify dashboard time windows, zero-value charts, and all-time fallback states.
- Distinguish low stock from out of stock in dashboard alerts and counts.
- Repair Tanzania WhatsApp debt reminders, include the shop name, add debt age, labelled fields, and an optional due date.
- Add credit-sale due dates and cash change calculation.
- Group navigation with AI Assistant near the top and translate the barcode entry in Kiswahili.
- Correct zero-stock AI wording and format the WhatsApp summary for copying.

## Next: verify with real merchants

1. Replace placeholder social proof with two or three approved, named merchant testimonials and product screenshots. Do not invent endorsements.
2. Test registration, login redirect, POS, credit sale, and WhatsApp debt reminder on Android Chrome with a real Tanzania phone number.
3. Run PageSpeed Insights and a throttled mobile test; track FCP, LCP, and page weight before changing imagery or loading strategy.
4. Configure the Vercel toolbar so it is disabled for production, then verify from an incognito browser.
5. Have Tanzanian counsel review the Terms, Privacy Policy, consent wording, retention, and support process under the Personal Data Protection Act 2022.
6. Configure the existing frontend Sentry integration in Vercel and complete a separate browser/server alert drill.

## Next: product decisions

1. Define a separate POS-only permission if cashiers must not see sales history, debt totals, or customer orders.
2. Add customer lookup/autocomplete and merge rules for repeat credit customers.
3. Add receipt sharing after a sale and an undo/void process with a clear audit trail.
4. Rank AI stock actions by recent sales velocity and margin contribution, not only stock level.
5. Decide whether expired products should be hidden in POS or shown as blocked with a clear explanation.

## Next: usability polish

1. Make inventory restock a labelled primary action and place destructive delete actions behind a confirmation/overflow action.
2. Show currency profit per unit beside margin percent in inventory.
3. Add an explicit renewal date and tap-to-copy controls on Billing.
4. Add a dated source note below competitor prices and review them quarterly.
5. Apply the labelled-field pattern to remaining forms, especially expenses, supplier orders, and settings-adjacent workflows.
