import { useAuthStore } from '@/app/store/auth.store'
import { invokeEdgeFunction } from '@/shared/lib/supabase-edge'
import type { BillingOverviewPayload } from '@/shared/lib/billing-overview-map'
import { mapOverviewToSubscriptions } from '@/shared/lib/billing-overview-map'

export async function syncCheckoutSession(sessionId: string): Promise<true> {
  const token = useAuthStore.getState().token
  if (!token) throw new Error('Not signed in')

  await invokeEdgeFunction(token, 'billing-sync-checkout', {
    body: { sessionId },
  })

  const overview = await invokeEdgeFunction<BillingOverviewPayload>(
    token,
    'billing-overview',
    { method: 'GET' },
  )
  const subs = mapOverviewToSubscriptions(overview)
  if (subs) useAuthStore.getState().updateUser({ subscriptions: subs })

  return true
}
