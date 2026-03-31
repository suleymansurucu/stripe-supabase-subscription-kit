import type { UserSubscription, SubscriptionStatus } from '@/shared/types'
import { CAPABLE_PRODUCT_ID } from '@/shared/constants/subscription'

export interface BillingOverviewPayload {
  subscription?: {
    stripe_subscription_id?: string
    status?: string
  } | null
}

export function mapOverviewToSubscriptions(
  overview: BillingOverviewPayload,
): UserSubscription[] | undefined {
  const sub = overview.subscription
  if (!sub?.stripe_subscription_id || !sub.status) return undefined
  if (!['active', 'trialing'].includes(sub.status)) return undefined
  return [
    {
      id: sub.stripe_subscription_id,
      status: sub.status as SubscriptionStatus,
      plan: { product: { id: CAPABLE_PRODUCT_ID, name: 'Subscription' } },
    },
  ]
}
