/**
 * UI + Checkout price list — must stay in sync with Edge Function whitelist
 * (`billing-subscribe`, `billing-change-plan`, `billing-create-checkout-session`).
 *
 * Replace the placeholder price IDs below with your own from the Stripe Dashboard.
 */
export type PlanInterval = 'month' | 'year'

export interface StripePlanOption {
  priceId: string
  name: string
  description: string
  interval: PlanInterval
  /** Display hint only (cents); Stripe is source of truth for charged amount */
  amountUsd: number
  /** Trial period days offered at checkout (display only; Stripe config is authoritative) */
  trialDays: number
  features: string[]
}

export const STRIPE_PLAN_OPTIONS: StripePlanOption[] = [
  {
    priceId: 'price_YOUR_SIMPLE_MONTHLY_PRICE_ID',
    name: 'Simple',
    description: 'Essential tools for small teams.',
    interval: 'month',
    amountUsd: 2900,
    trialDays: 14,
    features: [
      'Up to 3 campaigns',
      'Basic reward manager',
      'Data Hub access',
      'Email support',
    ],
  },
  {
    priceId: 'price_YOUR_SIMPLE_YEARLY_PRICE_ID',
    name: 'Simple',
    description: 'Essential tools — billed yearly.',
    interval: 'year',
    amountUsd: 29000,
    trialDays: 14,
    features: [
      'Up to 3 campaigns',
      'Basic reward manager',
      'Data Hub access',
      'Email support',
    ],
  },
  {
    priceId: 'price_YOUR_PRO_MONTHLY_PRICE_ID',
    name: 'Pro',
    description: 'Full campaigns, rewards, and data.',
    interval: 'month',
    amountUsd: 7900,
    trialDays: 14,
    features: [
      'Unlimited campaigns',
      'Advanced reward manager',
      'Full Data Hub + exports',
      'Connections & integrations',
      'Sub-user management',
      'Priority support',
    ],
  },
  {
    priceId: 'price_YOUR_PRO_YEARLY_PRICE_ID',
    name: 'Pro',
    description: 'Full platform — billed yearly.',
    interval: 'year',
    amountUsd: 79000,
    trialDays: 14,
    features: [
      'Unlimited campaigns',
      'Advanced reward manager',
      'Full Data Hub + exports',
      'Connections & integrations',
      'Sub-user management',
      'Priority support',
    ],
  },
]

/** Group plans by name for the pricing grid (monthly + yearly toggle). */
export const PLAN_GROUPS = ['Simple', 'Pro'] as const
export type PlanGroupName = (typeof PLAN_GROUPS)[number]

export function getPlansByGroup(interval: PlanInterval): StripePlanOption[] {
  return STRIPE_PLAN_OPTIONS.filter((p) => p.interval === interval)
}

export function formatPlanPrice(amountUsd: number, interval: PlanInterval): string {
  const dollars = amountUsd / 100
  if (interval === 'year') {
    const perMonth = dollars / 12
    return `$${perMonth % 1 === 0 ? perMonth.toFixed(0) : perMonth.toFixed(2)}/mo`
  }
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}/mo`
}
