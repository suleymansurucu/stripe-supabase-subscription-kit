import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/app/store/auth.store'
import { invokeEdgeFunction } from '@/shared/lib/supabase-edge'

interface CheckoutSessionResponse {
  checkoutUrl: string
  sessionId: string
  usedTrialOffer?: boolean
}

export function useCreateCheckoutSession() {
  const token = useAuthStore((s) => s.token)

  return useMutation({
    mutationFn: async (priceId: string) => {
      if (!token) throw new Error('Not signed in')
      return invokeEdgeFunction<CheckoutSessionResponse>(token, 'billing-create-checkout-session', {
        body: { priceId },
      })
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl)
      }
    },
  })
}
