# Postman — Supabase Auth + Stripe POC Edge Functions

## Import

1. Postman → **Import** → select `supabase-stripe-poc.postman_collection.json`.
2. Right-click the collection → **Edit** → **Variables** tab.

## Collection variables (fill these in)

| Variable | Where to get it |
|----------|----------------|
| `base_url` | `https://<YOUR_PROJECT_REF>.supabase.co` — Dashboard → Settings → API → Project URL |
| `anon_key` | Dashboard → Settings → API → **anon public** key |
| `user_email` | Email of a user you created in Supabase Auth |
| `user_password` | That user's password |
| `access_token` | Leave blank; filled automatically by the Auth request |
| `price_id_pro_monthly` | Your actual `price_xxx` from Stripe Dashboard |
| `checkout_session_id` | `cs_…` value — filled after billing-create-checkout-session or from the redirect URL |

## Request order

1. **Auth — Password (get JWT)** → **Send**
   - On success, the Tests script writes `access_token` into the collection variable.
   - Response should contain a long `access_token` string.

2. **Edge — billing-overview** or **billing-subscribe** → **Send**
   - `Authorization: Bearer` is automatically set from `access_token`.
   - `apikey` header is sent automatically from `anon_key`.

## Additional billing endpoints

| Request | Description |
|---------|-------------|
| `billing-cancel` | POST `{"atPeriodEnd":true}` — cancel at period end; `false` = immediate. |
| `billing-change-plan` | POST `priceId` + optional `prorationBehavior`. |
| `billing-invoices` | GET — invoice list. |
| `billing-payment-method` | GET — card summary or `null`. |
| `billing-portal` | POST — `portalUrl` (requires `BILLING_PORTAL_RETURN_URL` secret + Stripe Customer Portal enabled). |

## Stripe Checkout flow (card 4242)

Edge secrets required: `CHECKOUT_SUCCESS_URL` (must contain `{CHECKOUT_SESSION_ID}`) and `CHECKOUT_CANCEL_URL`.

Example success URL: `http://localhost:5173/billing/checkout-return?session_id={CHECKOUT_SESSION_ID}`

1. **billing-create-checkout-session** → Send → open `checkoutUrl` from the response in a browser.
2. On Stripe's page enter card: `4242 4242 4242 4242`, any future expiry, any CVC.
3. Copy the `session_id` (`cs_…`) from the redirect URL into the `checkout_session_id` collection variable.
4. **billing-sync-checkout** → Send → DB `subscriptions` table is updated.

## Troubleshooting

- **401 Invalid session:** Run the Auth request first; re-run if the token has expired.
- **Auth 400:** If email confirmation is enabled, confirm the user in Dashboard → Authentication → Users, or disable email confirmation for the POC.
- **billing-subscribe 409:** User already has an active or trialing subscription.
- **create-checkout-session 500 / Missing CHECKOUT_*:** Set `CHECKOUT_SUCCESS_URL` and `CHECKOUT_CANCEL_URL` in Edge Secrets; the success URL must contain `{CHECKOUT_SESSION_ID}`.
- **billing-portal 500:** Set `BILLING_PORTAL_RETURN_URL` secret + configure Stripe Customer Portal in Stripe Dashboard.
- **JWT verify error:** All Edge Functions should be deployed with **Verify JWT off** — they verify the JWT internally.

Collection file: [supabase-stripe-poc.postman_collection.json](./supabase-stripe-poc.postman_collection.json)
