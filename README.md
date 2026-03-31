# stripe-supabase-subscription-kit

> A production-ready Proof of Concept for Stripe subscription billing with Supabase Edge Functions, React frontend, and webhook-driven state sync.

---

## What this is

A fully working end-to-end billing system POC built on:

- **Frontend** — React 19 + Vite + TypeScript
- **Backend** — 14 Supabase Edge Functions (Deno runtime)
- **Database** — Supabase PostgreSQL with Row-Level Security
- **Payments** — Stripe (subscriptions, checkout, webhooks, customer portal)
- **State** — TanStack Query (server state) + Zustand (client state)

The core architectural principle: **Stripe is the billing source of truth**. Supabase stores a read-model cache of subscription state, kept in sync via webhooks.

---

## Features

| Feature | Status |
|---|---|
| Subscription creation with free trial (one-time per user) | ✅ |
| Stripe Checkout (hosted payment page) | ✅ |
| Custom payment UI via SetupIntent + PaymentElement | ✅ |
| Plan upgrade / downgrade with proration | ✅ |
| Cancel at period end or immediately | ✅ |
| Pause / resume subscription | ✅ |
| Invoice list with status + PDF link | ✅ |
| Default payment method management | ✅ |
| Stripe Customer Portal (self-service) | ✅ |
| Webhook processing (idempotent, signature-verified) | ✅ |
| Row-Level Security on all billing tables | ✅ |
| Postman collection for API testing | ✅ |

---

## Architecture

```
┌─────────────────────────────────┐
│         React Frontend          │
│  (billing page, checkout, modals)│
└────────────┬────────────────────┘
             │ JWT (Supabase Auth)
             ▼
┌─────────────────────────────────┐
│    Supabase Edge Functions      │  ← All secrets live here only
│    (14 Deno functions)          │
└────────┬────────────────────────┘
         │                 │
         ▼                 ▼
   ┌──────────┐     ┌────────────┐
   │  Stripe  │     │  Supabase  │
   │   API    │     │  Postgres  │
   └──────────┘     └────────────┘
         │
         │ Webhook (signature verified)
         ▼
┌─────────────────────────────────┐
│     stripe-webhook function     │
│  (idempotent, updates DB state) │
└─────────────────────────────────┘
```

---

## Repository Structure

```
├── src/
│   ├── features/billing/          # Billing UI feature
│   │   ├── components/            # BillingPage, UpdateCardModal, ChangePlanModal, PauseModal
│   │   ├── hooks/useBilling.ts    # Centralized billing state (TanStack Query)
│   │   └── api/                   # Edge Function client wrappers
│   ├── features/onboarding/       # Registration + checkout flow
│   ├── pages/
│   │   ├── billing.tsx            # Main billing page
│   │   ├── billing-checkout-return.tsx  # Stripe Checkout return handler
│   │   └── checkout.tsx           # Custom payment UI (SetupIntent)
│   └── shared/
│       ├── constants/stripe-plans.ts   # Plan definitions + price IDs
│       ├── lib/stripe.ts               # Stripe.js initialization
│       └── types/index.ts              # TypeScript types
│
├── supabase/
│   ├── functions/                 # 14 Edge Functions (see below)
│   └── migrations/                # 3 SQL migrations
│
└── docs/
    ├── stripe-supabase-poc-plan.md      # Architecture + sprint plan
    ├── supabase-stripe-poc-phase1.md    # Step-by-step deployment guide
    ├── backend-billing-api-reference.md # API endpoint contracts
    └── postman/                         # Postman collection (13 requests)
```

---

## Edge Functions

| Function | Purpose | Auth |
|---|---|---|
| `billing-subscribe` | Create subscription (with one-time trial logic) | JWT |
| `billing-cancel` | Cancel at period end or immediately | JWT |
| `billing-change-plan` | Upgrade/downgrade with proration | JWT |
| `billing-pause` | Pause or resume subscription | JWT |
| `billing-overview` | Fetch subscription + profile summary | JWT |
| `billing-invoices` | List recent invoices from Stripe | JWT |
| `billing-payment-method` | Fetch default payment method details | JWT |
| `billing-portal` | Generate Stripe Customer Portal URL | JWT |
| `billing-create-checkout-session` | Create Stripe Checkout session | JWT |
| `billing-sync-checkout` | Sync DB after Checkout (pre-webhook, POC only) | JWT |
| `billing-ensure-customer` | Create Stripe customer if missing | JWT |
| `billing-create-setup-intent` | SetupIntent for custom payment UI | JWT |
| `billing-update-default-pm` | Set a payment method as default | JWT |
| `stripe-webhook` | Process Stripe events (no JWT, signature-verified) | Stripe Sig |

---

## Database Schema

### `profiles`
Extends `auth.users`. Stores the Stripe customer ID and trial state.

```sql
id               uuid  PRIMARY KEY  -- matches auth.users.id
email            text
full_name        text
stripe_customer_id text UNIQUE
has_used_trial   boolean DEFAULT false
created_at       timestamptz DEFAULT now()
```

### `subscriptions`
Read model cached from Stripe. Updated by Edge Functions + webhooks.

```sql
id                      uuid  PRIMARY KEY
user_id                 uuid  REFERENCES profiles(id)
stripe_subscription_id  text  UNIQUE
stripe_price_id         text
status                  text  -- trialing | active | past_due | canceled | ...
current_period_start    timestamptz
current_period_end      timestamptz
cancel_at_period_end    boolean DEFAULT false
trial_start             timestamptz
trial_end               timestamptz
paused                  boolean DEFAULT false
created_at              timestamptz
updated_at              timestamptz
```

### `billing_events`
Webhook audit trail. `stripe_event_id` unique constraint ensures idempotency.

```sql
id               uuid  PRIMARY KEY
stripe_event_id  text  UNIQUE  -- idempotency key
type             text
payload          jsonb
processed_at     timestamptz DEFAULT now()
```

---

## Payment Flows

### Flow 1 — Stripe Checkout (Hosted)

```
1. POST billing-create-checkout-session  →  { url }
2. Redirect user to Stripe hosted page
3. User enters card (test: 4242 4242 4242 4242)
4. Stripe redirects to CHECKOUT_SUCCESS_URL?session_id=...
5. POST billing-sync-checkout  →  DB updated (POC sync)
6. Webhook confirms subscription asynchronously
```

### Flow 2 — Custom UI (SetupIntent)

```
1. POST billing-create-setup-intent  →  { clientSecret }
2. Render Stripe PaymentElement with clientSecret
3. User confirms payment in your own UI
4. POST billing-update-default-pm  →  payment method saved
5. POST billing-subscribe with { priceId, paymentMethodId }
```

---

## Trial Logic

- One-time per user, tracked by `profiles.has_used_trial`
- 15-day free trial on first subscription only
- Subsequent subscriptions start immediately without trial
- Trial status flagged in DB via webhook `subscription.trial_start` field

---

## Webhook Security

The `stripe-webhook` function:
1. Verifies `Stripe-Signature` header using `STRIPE_WEBHOOK_SECRET`
2. Inserts `billing_events` row first — if `stripe_event_id` already exists (error code `23505`), returns early (idempotent)
3. Processes event, rolls back `billing_events` row on failure so retries work correctly

Handled events:
- `checkout.session.completed`
- `customer.subscription.created/updated/deleted`
- `invoice.paid`
- `invoice.payment_failed`

---

## Setup

### Prerequisites

- [Stripe account](https://stripe.com) (test mode)
- [Supabase project](https://supabase.com)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Node.js 20+

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/stripe-supabase-subscription-kit
cd stripe-supabase-subscription-kit
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.development
```

Edit `.env.development`:
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...your-publishable-key
```

> **Note:** `VITE_SUPABASE_ANON_KEY` and `VITE_STRIPE_PUBLISHABLE_KEY` are safe to expose in the frontend. Never put `STRIPE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` here.

### 3. Run Supabase migrations

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### 4. Create Stripe products and prices

In the Stripe Dashboard (Test mode):
1. Create a **Product** (e.g. "Pro Plan")
2. Add **recurring prices** — monthly and yearly
3. Note the `price_xxx` IDs

Update `src/shared/constants/stripe-plans.ts` with your actual price IDs:
```ts
{ priceId: 'price_YOUR_SIMPLE_MONTHLY', ... }
{ priceId: 'price_YOUR_SIMPLE_YEARLY',  ... }
{ priceId: 'price_YOUR_PRO_MONTHLY',    ... }
{ priceId: 'price_YOUR_PRO_YEARLY',     ... }
```

Update each Edge Function's `ALLOWED_PRICE_IDS` set with the same IDs.

### 5. Configure Edge Function secrets

In Supabase Dashboard → Project Settings → Edge Functions → Secrets:

```
STRIPE_SECRET_KEY          sk_test_...
STRIPE_WEBHOOK_SECRET      whsec_...
CHECKOUT_SUCCESS_URL       https://yourdomain.com/billing/return?session_id={CHECKOUT_SESSION_ID}
CHECKOUT_CANCEL_URL        https://yourdomain.com/plans
BILLING_PORTAL_RETURN_URL  https://yourdomain.com/billing
```

> These secrets are injected at runtime — never committed to the repository.

### 6. Deploy Edge Functions

```bash
supabase functions deploy billing-subscribe
supabase functions deploy billing-cancel
supabase functions deploy billing-change-plan
supabase functions deploy billing-pause
supabase functions deploy billing-overview
supabase functions deploy billing-invoices
supabase functions deploy billing-payment-method
supabase functions deploy billing-portal
supabase functions deploy billing-create-checkout-session
supabase functions deploy billing-sync-checkout
supabase functions deploy billing-ensure-customer
supabase functions deploy billing-create-setup-intent
supabase functions deploy billing-update-default-pm
supabase functions deploy stripe-webhook --no-verify-jwt
```

> `stripe-webhook` must be deployed with `--no-verify-jwt` — it uses Stripe signature verification instead.

### 7. Register the webhook in Stripe

Stripe Dashboard → Developers → Webhooks → Add endpoint:

```
URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
```

Select events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Copy the **Signing secret** (`whsec_...`) → save as `STRIPE_WEBHOOK_SECRET` Edge Function secret.

### 8. Run locally

```bash
npm run dev
```

---

## Local Webhook Testing (Stripe CLI)

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe listen --forward-to https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook

# Trigger a test event
stripe trigger customer.subscription.created
```

---

## Test Cards

| Scenario | Card Number |
|---|---|
| Successful payment | `4242 4242 4242 4242` |
| Payment declined | `4000 0000 0000 9995` |
| 3D Secure required | `4000 0025 0000 3155` |

Use any future expiry date and any 3-digit CVV.

---

## API Reference

See [docs/backend-billing-api-reference.md](./docs/backend-billing-api-reference.md) for full request/response contracts.

A Postman collection with 13 pre-configured requests is available at [docs/postman/](./docs/postman/).

---

## Security Model

| Layer | Approach |
|---|---|
| Frontend secrets | Only anon key + publishable key (both safe for public) |
| Backend secrets | Supabase Edge Function secrets (never in git) |
| API auth | JWT verified on every request via `supabase.auth.getUser()` |
| Webhook auth | Stripe-Signature header verified via `stripe.webhooks.constructEvent()` |
| Price validation | All price IDs validated against server-side whitelist |
| Database access | Row-Level Security — users can only read their own records |
| Service role key | Used only inside Edge Functions, never exposed to frontend |
| Idempotency | `stripe_event_id` unique constraint prevents duplicate webhook processing |

---

## Roadmap / Out of Scope for POC

- [ ] Multi-currency support
- [ ] Tax calculation (Stripe Tax)
- [ ] Enterprise custom invoicing
- [ ] Metered billing
- [ ] Team/seat-based billing
- [ ] Usage-based pricing

---

## License

MIT
