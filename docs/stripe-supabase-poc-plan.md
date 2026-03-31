# Stripe + Supabase Subscription POC Plan

## 1) POC Goals and Scope

The following flows must work by the end of the POC:

- User registration (Supabase Auth + profile)
- Stripe subscription creation
- 14-day free trial
- Subscription cancellation (at period end and immediate)
- Plan upgrade / downgrade
- Payment history listing
- Card summary display (brand, last4, expiry)
- Webhook-driven status sync to Supabase

Out of scope (for now):
- Multi-currency
- Detailed tax / invoice customisation
- Enterprise custom invoicing

---

## 2) Architecture Principles

- **Stripe** = billing source of truth (subscriptions / payments live here)
- **Supabase** = app read model (cache for the UI)
- Frontend never writes critical billing state directly — it calls Edge Functions
- Billing state changes are reflected to the DB via webhook

---

## 3) Technology Stack

- Frontend: React 19 + Vite + TypeScript
- Backend API: Supabase Edge Functions (Deno)
- DB / Auth: Supabase (PostgreSQL + RLS)
- Payments: Stripe

### Environments

- `local` (development)
- `staging` (optional)
- `production`

Each environment uses separate env values:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## 4) Stripe Test Mode Setup

### 4.1 Enable test mode

1. Open Stripe Dashboard.
2. Toggle **Test mode** on (bottom-left or top toggle).
3. All product/price objects you create in test mode are separate from live mode.

### 4.2 Create Product + Prices

1. **Product catalog → Add product**
2. Example name: `Simple Plan`, `Pro Plan`
3. Pricing model: `Recurring`
4. Create both **Monthly** and **Yearly** variants
5. Copy the generated `price_xxx` IDs into `src/shared/constants/stripe-plans.ts` and the `ALLOWED_PRICE_IDS` sets in the Edge Functions

### 4.3 Get API keys

1. **Developers → API keys**
2. `Publishable key` → `VITE_STRIPE_PUBLISHABLE_KEY` (frontend)
3. `Secret key` → `STRIPE_SECRET_KEY` (Edge Function secret only — never in frontend)

### 4.4 Configure webhook endpoint

1. **Developers → Webhooks → Add endpoint**
2. URL: `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `checkout.session.completed`
4. Copy the **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET` Edge Function secret

### 4.5 Test cards

| Scenario | Card number |
|----------|-------------|
| Successful payment | `4242 4242 4242 4242` |
| Payment declined | `4000 0000 0000 9995` |
| 3D Secure required | `4000 0025 0000 3155` |

Any future expiry date and any CVC (e.g. `12/34`, `123`).

---

## 5) Supabase Data Model (POC minimum)

### 5.1 `profiles`

- `id` uuid (PK, linked to `auth.users`)
- `email` text
- `full_name` text
- `stripe_customer_id` text unique
- `has_used_trial` boolean default false
- `created_at`, `updated_at` timestamptz

### 5.2 `subscriptions`

- `id` uuid PK
- `user_id` uuid FK → profiles.id
- `stripe_subscription_id` text unique
- `stripe_price_id` text
- `status` text (`trialing`, `active`, `past_due`, `canceled`, …)
- `current_period_start`, `current_period_end` timestamptz
- `cancel_at_period_end` boolean default false
- `trial_start`, `trial_end` timestamptz null
- `paused` boolean default false
- `created_at`, `updated_at`

### 5.3 `billing_events`

- `id` uuid PK
- `stripe_event_id` text unique (**idempotency key**)
- `type` text
- `payload` jsonb
- `processed_at` timestamptz

---

## 6) Endpoint Plan (POC API Contract)

All endpoints require auth (except `stripe-webhook`).

### 6.1 Subscription actions

- `POST billing-subscribe` — `{ priceId }` — creates subscription (with trial if eligible)
- `POST billing-cancel` — `{ atPeriodEnd: true }` (default) or `false` (immediate)
- `POST billing-change-plan` — `{ priceId, prorationBehavior }`
- `POST billing-pause` — `{ pause: true | false }`

### 6.2 Billing read endpoints

- `GET/POST billing-overview` — latest subscription + profile summary from DB
- `GET/POST billing-invoices` — Stripe `invoices.list`
- `GET/POST billing-payment-method` — default card summary

### 6.3 Setup / checkout

- `POST billing-create-setup-intent` — creates SetupIntent for custom payment UI
- `POST billing-create-checkout-session` — creates hosted Checkout URL
- `POST billing-sync-checkout` — syncs DB after hosted Checkout completes
- `POST billing-update-default-pm` — sets saved payment method as default
- `POST billing-ensure-customer` — idempotently creates Stripe Customer

### 6.4 Customer portal

- `POST billing-portal` — returns `{ portalUrl }` (requires `BILLING_PORTAL_RETURN_URL` Edge secret)

---

## 7) 14-Day Trial Logic

Goal: each user gets exactly one trial.

Flow:
1. In `billing-subscribe`: check `profiles.has_used_trial`.
2. If `false`, pass `trial_period_days: 14` when creating the subscription.
3. On success, set `has_used_trial = true`.
4. Subsequent subscriptions get no trial.

Access:
- `trialing` status → full access granted.
- If payment fails after trial → status becomes `past_due` / `unpaid` → restrict access.

---

## 8) Webhook Processing Strategy

- Verify Stripe signature before processing any event.
- Use `stripe_event_id` unique constraint in `billing_events` for idempotency.
- On duplicate event (Postgres unique violation code `23505`): return `200 { received: true, duplicate: true }`.
- On processing error: delete the `billing_events` row so Stripe retries.

Events handled:
- `customer.subscription.created/updated/deleted` → sync `subscriptions` table
- `invoice.paid` → mark as active/paid
- `invoice.payment_failed` → set `past_due`
- `checkout.session.completed` → sync subscription from hosted checkout

---

## 9) Frontend Integration Plan

Feature-based structure:

- `src/features/billing/api/` → billing endpoint calls (REST fallback)
- `src/features/billing/hooks/` → `useBilling` (TanStack Query)
- `src/features/billing/components/` → BillingPage, modals (ChangePlan, Pause, UpdateCard)
- `src/features/onboarding/` → PlansPage, CheckoutPage, Register/Login flows
- `src/pages/billing.tsx` → route entry point

State categories:
- Server state (subscription, invoices) → TanStack Query
- Local UI state (modal open/close) → `useState`

---

## 10) Implementation Checklist

1. Stripe test mode + Products/Prices created + keys copied
2. Supabase tables + RLS applied (run migrations)
3. Edge Function secrets configured
4. All 14 Edge Functions deployed with `--no-verify-jwt`
5. `stripe-webhook` endpoint registered in Stripe Dashboard
6. Frontend `.env.development` filled with real keys
7. End-to-end test scenarios passing

---

## 11) Test Scenarios (POC Exit Criteria)

- New user can start trial
- Trial is not granted twice
- Cancel at period end works
- Immediate cancel works
- Plan upgrade/downgrade works
- Payment history lists correctly
- Card summary renders correctly
- Webhook keeps DB status in sync
- Failed payment event updates status correctly

---

## 12) Risks and Notes

- Timezone handling: trial end date must be interpreted correctly.
- Webhook retries must not create duplicate DB entries (handled by `billing_events` unique constraint).
- Secret key and webhook secret must never reach the frontend.
- Test and production keys / price IDs must be strictly separated.

---

Related operational guide: [supabase-stripe-poc-phase1.md](./supabase-stripe-poc-phase1.md)
