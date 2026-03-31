# Backend Billing API — Edge Functions Reference

All URLs: `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/<function-name>`

Common headers (all except stripe-webhook):

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <Supabase user access_token>` |
| `apikey` | Supabase **anon (public)** key |
| `Content-Type` | `application/json` (for POST bodies) |

**Webhook:** `stripe-webhook` is called only by Stripe; verified via `Stripe-Signature`. No JWT. Deploy with **Verify JWT off**.

---

## Secrets (Edge Functions)

| Secret | Used by |
|--------|---------|
| `STRIPE_SECRET_KEY` | All functions that call Stripe + webhook |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` |
| `CHECKOUT_SUCCESS_URL` | `billing-create-checkout-session` — must contain `{CHECKOUT_SESSION_ID}` |
| `CHECKOUT_CANCEL_URL` | `billing-create-checkout-session` |
| `BILLING_PORTAL_RETURN_URL` | `billing-portal` — full `https://…` return URL |

Automatic (Supabase-injected): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## Endpoint contracts

### `billing-ensure-customer`

| | |
|---|---|
| Method | `POST` |
| Body | `{}` |
| Description | Creates Stripe Customer if missing; writes `stripe_customer_id` to profiles. |

**200:** `{ stripeCustomerId, alreadyExisted }`

---

### `billing-subscribe`

| | |
|---|---|
| Method | `POST` |
| Body | `{ "priceId": "price_xxx" }` — must be in ALLOWED_PRICE_IDS |
| Description | Direct API subscription (trial if eligible; payment method optional). |

**200:** `{ stripeSubscriptionId, status, trialEnd, currentPeriodEnd, paymentIntentClientSecret, usedTrial }`
**409:** Already has an active/trialing subscription.

---

### `billing-overview`

| | |
|---|---|
| Method | `GET` or `POST` |
| Body | — |
| Description | Latest subscription + profile summary from DB. |

**200:** `{ profile: { stripeCustomerId, hasUsedTrial }, subscription: object | null }`

---

### `billing-create-setup-intent`

| | |
|---|---|
| Method | `POST` |
| Body | `{}` |
| Description | Creates a Stripe SetupIntent for the custom payment UI (register + checkout flows). |

**200:** `{ clientSecret, customerId }`

---

### `billing-create-checkout-session`

| | |
|---|---|
| Method | `POST` |
| Body | `{ "priceId": "price_xxx" }` |
| Description | Stripe hosted Checkout URL; card is collected on Stripe's page. |

**200:** `{ checkoutUrl, sessionId, usedTrialOffer }`
**500:** Checkout URL secrets missing.

---

### `billing-sync-checkout`

| | |
|---|---|
| Method | `POST` |
| Body | `{ "sessionId": "cs_xxx" }` |
| Description | DB sync after hosted Checkout completes (POC fallback when no webhook). |

**200:** `{ ok, stripeSubscriptionId, status }`
**403:** Session belongs to a different user.

---

### `billing-update-default-pm`

| | |
|---|---|
| Method | `POST` |
| Body | `{ "paymentMethodId": "pm_xxx" }` |
| Description | Attaches payment method to customer, sets as default on customer + active subscriptions. |

**200:** `{ ok: true }`

---

### `billing-cancel`

| | |
|---|---|
| Method | `POST` |
| Body | `{ "atPeriodEnd": true }` (default) or `false` (immediate) |
| Description | Cancels the user's latest active subscription; syncs DB. |

**200:** `{ stripeSubscriptionId, status, cancelAtPeriodEnd, currentPeriodEnd }`
**404:** No cancellable subscription found.

---

### `billing-change-plan`

| | |
|---|---|
| Method | `POST` |
| Body | `{ "priceId": "price_xxx", "prorationBehavior": "create_prorations" | "none" }` |
| Description | Swaps the price on the existing subscription's single line item. |

**200:** `{ stripeSubscriptionId, status, stripePriceId, currentPeriodEnd }`
**409:** Already on this price.

---

### `billing-pause`

| | |
|---|---|
| Method | `POST` |
| Body | `{ "pause": true }` (pause) or `{ "pause": false }` (resume) |
| Description | Pauses (keep_as_draft) or resumes billing collection on the active subscription. |

**200:** `{ stripeSubscriptionId, status, paused }`

---

### `billing-invoices`

| | |
|---|---|
| Method | `GET` or `POST` |
| Body | — |
| Description | `stripe.invoices.list` (last 24 invoices). |

**200:** `{ invoices: [{ id, number, date, amount, currency, status, invoiceUrl, pdfUrl }] }`

---

### `billing-payment-method`

| | |
|---|---|
| Method | `GET` or `POST` |
| Body | — |
| Description | Default payment method or first saved card. |

**200:** `{ paymentMethod: { id, brand, last4, expMonth, expYear } | null }`

---

### `billing-portal`

| | |
|---|---|
| Method | `POST` |
| Body | `{}` |
| Description | Creates Stripe Customer Portal session. |

**200:** `{ portalUrl }`
**404:** No Stripe customer yet.
**502:** Stripe Customer Portal not configured / not active.

---

### `stripe-webhook`

| | |
|---|---|
| Method | `POST` |
| Body | Raw JSON (Stripe event) — verified via `req.text()` before any JSON parsing |
| Description | Idempotent via `billing_events`; syncs `subscriptions` table. |

Events handled: `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`.

**200:** `{ received: true }` or `{ received: true, duplicate: true }`

---

## Database tables

- `profiles` — `stripe_customer_id`, `has_used_trial`, …
- `subscriptions` — Stripe subscription read-model
- `billing_events` — `stripe_event_id` unique (webhook idempotency)

Migration files: `supabase/migrations/`.

---

## Price ID whitelist

Replace these placeholders in the Edge Functions and `src/shared/constants/stripe-plans.ts` with your actual Stripe price IDs:

| Plan | Interval | Placeholder |
|------|----------|-------------|
| Simple | Monthly | `price_YOUR_SIMPLE_MONTHLY_PRICE_ID` |
| Simple | Yearly | `price_YOUR_SIMPLE_YEARLY_PRICE_ID` |
| Pro | Monthly | `price_YOUR_PRO_MONTHLY_PRICE_ID` |
| Pro | Yearly | `price_YOUR_PRO_YEARLY_PRICE_ID` |

---

## Frontend Checkout success URL

Example (Edge secret `CHECKOUT_SUCCESS_URL`):

```text
http://localhost:5173/billing/checkout-return?session_id={CHECKOUT_SESSION_ID}
```

The app's `/billing/checkout-return` route calls `billing-sync-checkout` with the `session_id`, then redirects to the dashboard.

Related operational guide: [supabase-stripe-poc-phase1.md](./supabase-stripe-poc-phase1.md)
