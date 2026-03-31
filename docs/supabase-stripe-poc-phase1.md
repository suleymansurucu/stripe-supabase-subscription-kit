# Supabase + Stripe POC — Phase 1 (Before Webhooks)

Goal of this phase: **tables + RLS**, **Edge Functions for subscription management**, **initial DB writes** (from Stripe API responses). Until the webhook is running, some Stripe-side changes (cancellation, payment failure) won't automatically sync to DB — this is accepted for POC purposes.

## 0) Security (do this first)

- **Secret key** only goes in: Supabase **Edge Function Secrets** or server environment — **never** in the React bundle or Git.
- **Publishable key** (`pk_test_…`) is used on the frontend; pass it via `.env.development` (gitignored), never hardcode.

## 1) Stripe — Price IDs

Create two products (Simple + Pro) with monthly and yearly prices in Stripe test mode. Copy the generated `price_xxx` IDs into:

1. `src/shared/constants/stripe-plans.ts` — the `STRIPE_PLAN_OPTIONS` array
2. The `ALLOWED_PRICE_IDS` sets in `billing-subscribe`, `billing-change-plan`, and `billing-create-checkout-session` Edge Functions

Verify you're in test mode: keys should start with `pk_test_` / `sk_test_`.

## 2) Supabase project and CLI

1. Create or select a project on [Supabase Dashboard](https://supabase.com/dashboard).
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) if not already installed.
3. From the repo root:

```bash
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
```

`PROJECT_REF`: Dashboard → Project Settings → General → Reference ID.

## 3) Database: apply migrations

This repo contains three migrations in `supabase/migrations/`:

- `20260327120000_billing_poc.sql` — profiles, subscriptions, auth trigger, RLS
- `20260328120000_billing_events.sql` — billing_events table (webhook idempotency)
- `20260328150000_billing_paused.sql` — paused column on subscriptions

**Option A — CLI push:**

```bash
supabase db push
```

**Option B — SQL Editor:** Copy each file's contents into Dashboard → SQL Editor → New query → Run.

Note: If your project already has a `profiles` table + `on_auth_user_created` trigger, the first migration may conflict. In that case, read the comments in the migration file and apply only the missing columns and the `subscriptions` table.

## 4) Edge Function secrets

**Via Dashboard (recommended):** Supabase Dashboard → your project → Project Settings → Edge Functions → Secrets / "Manage secrets".

| Secret | Value |
|--------|-------|
| `STRIPE_SECRET_KEY` | Your Stripe **test** secret key (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_…`) — after step 7 |
| `CHECKOUT_SUCCESS_URL` | e.g. `http://localhost:5173/billing/checkout-return?session_id={CHECKOUT_SESSION_ID}` — **must contain `{CHECKOUT_SESSION_ID}` literally** |
| `CHECKOUT_CANCEL_URL` | e.g. `http://localhost:5173/plans` |
| `BILLING_PORTAL_RETURN_URL` | e.g. `http://localhost:5173/billing` — full `https://` URL |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase.

**CLI alternative:**

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set CHECKOUT_SUCCESS_URL=http://localhost:5173/billing/checkout-return?session_id={CHECKOUT_SESSION_ID}
supabase secrets set CHECKOUT_CANCEL_URL=http://localhost:5173/plans
supabase secrets set BILLING_PORTAL_RETURN_URL=http://localhost:5173/billing
```

## 5) Deploy Edge Functions

### 5A) Via Supabase Dashboard (no CLI)

1. Left menu → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Function name must match the folder name exactly.
3. Paste the full content of the corresponding `supabase/functions/<name>/index.ts` file.
4. Click **Deploy function**.
5. **Verify JWT:** set to **off** for all functions (they verify JWT internally via `getUser()`). **`stripe-webhook` must always have Verify JWT off** — Stripe does not send a Supabase JWT.
6. Repeat for all 14 functions.

### 5B) Via CLI

```bash
supabase functions deploy billing-ensure-customer --no-verify-jwt
supabase functions deploy billing-subscribe --no-verify-jwt
supabase functions deploy billing-overview --no-verify-jwt
supabase functions deploy billing-create-setup-intent --no-verify-jwt
supabase functions deploy billing-create-checkout-session --no-verify-jwt
supabase functions deploy billing-sync-checkout --no-verify-jwt
supabase functions deploy billing-update-default-pm --no-verify-jwt
supabase functions deploy billing-cancel --no-verify-jwt
supabase functions deploy billing-change-plan --no-verify-jwt
supabase functions deploy billing-invoices --no-verify-jwt
supabase functions deploy billing-payment-method --no-verify-jwt
supabase functions deploy billing-portal --no-verify-jwt
supabase functions deploy billing-pause --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
```

**Why `--no-verify-jwt`?** The `billing-*` functions verify the JWT internally using `getUser()`. `stripe-webhook` must skip JWT verification because Stripe only sends a `Stripe-Signature` header, not a Supabase JWT.

Function URL format: `https://<PROJECT_REF>.supabase.co/functions/v1/<function-name>`

Required headers (all except stripe-webhook):

```
Authorization: Bearer <supabase_user_access_token>
apikey: <supabase_anon_key>
Content-Type: application/json
```

## 6) Function reference

| Function | Method | Description |
|----------|--------|-------------|
| `billing-ensure-customer` | POST | Creates Stripe Customer if missing; writes `stripe_customer_id` to profiles. |
| `billing-subscribe` | POST | `{ priceId }` — direct API subscription (with trial if eligible). |
| `billing-create-setup-intent` | POST | Creates SetupIntent for custom payment UI (used in register + checkout flows). |
| `billing-create-checkout-session` | POST | `{ priceId }` — hosted Checkout URL. |
| `billing-sync-checkout` | POST | `{ sessionId }` — syncs DB after hosted Checkout completes. |
| `billing-update-default-pm` | POST | `{ paymentMethodId }` — attaches PM to customer + sets as default. |
| `billing-cancel` | POST | `{ atPeriodEnd: true }` (default) or `false` (immediate). |
| `billing-change-plan` | POST | `{ priceId, prorationBehavior }` — swaps price on existing subscription. |
| `billing-pause` | POST | `{ pause: true \| false }` — pauses or resumes billing collection. |
| `billing-invoices` | GET/POST | Stripe `invoices.list` (last 24). |
| `billing-payment-method` | GET/POST | Default card summary. |
| `billing-portal` | POST | Returns `{ portalUrl }` for Stripe Customer Portal. |
| `billing-overview` | GET/POST | Latest subscription + profile summary from DB. |
| `stripe-webhook` | POST | Signed Stripe event — idempotent via `billing_events`; syncs `subscriptions`. **JWT off.** |

## 7) Stripe Webhook setup

### 7.1 Supabase side

1. Apply `supabase/migrations/20260328120000_billing_events.sql` (creates `billing_events` table).
2. Deploy `stripe-webhook` function with `--no-verify-jwt`.
3. Add `STRIPE_WEBHOOK_SECRET` Edge secret (from step 7.2 below).

### 7.2 Stripe Dashboard side

1. [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **Webhooks** → **Add endpoint**
2. **Endpoint URL:**
   ```
   https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
   ```
3. **Events to send:**
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Save → copy **Signing secret** → add as `STRIPE_WEBHOOK_SECRET` Edge secret.

### 7.3 Local testing (optional)

```bash
stripe listen --forward-to https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
```

(The `stripe` CLI must be installed; use the `whsec_…` value from the listen output as `STRIPE_WEBHOOK_SECRET` temporarily.)

### 7.4 How it works

- `billing_events.stripe_event_id` is **unique** → same event is never processed twice.
- If handler throws, the event row is deleted → Stripe will retry.
- Subscription row is linked to user via `metadata.supabase_user_id` or `profiles.stripe_customer_id` lookup.

## 8) Recommended POC flow (no webhook yet)

1. Register in app → `auth.users` + trigger creates `profiles`.
2. Call `billing-ensure-customer` (or let `billing-subscribe` / `billing-create-setup-intent` create the customer automatically).
3. Use `billing-subscribe` or the hosted Checkout flow to start a subscription.
4. View status via `billing-overview` on the billing page.
5. Verify in Stripe Dashboard → Customers / Subscriptions.

## 9) Checklist

- [ ] `billing_poc` migration applied
- [ ] `billing_events` migration applied
- [ ] `billing_paused` migration applied
- [ ] All 14 Edge Functions deployed with Verify JWT **off**
- [ ] All required Edge Secrets set
- [ ] Stripe webhook endpoint registered + events selected
- [ ] `STRIPE_WEBHOOK_SECRET` Edge secret set
- [ ] Frontend `.env.development` filled with real keys
- [ ] End-to-end test: create subscription → check `billing_events` + `subscriptions`

Related main plan: [stripe-supabase-poc-plan.md](./stripe-supabase-poc-plan.md)
