import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/app/store/auth.store'
import { Button } from '@/shared/components/ui/button'
import { isSupabaseConfigured } from '@/shared/lib/supabase-client'
import { syncCheckoutSession } from '../lib/sync-checkout-session'

export function CheckoutReturnPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const sessionId = searchParams.get('session_id')

  const { isPending, isSuccess, isError, error } = useQuery({
    queryKey: ['billing', 'checkout-sync', sessionId],
    queryFn: () => syncCheckoutSession(sessionId!),
    enabled: Boolean(isSupabaseConfigured() && isAuthenticated && sessionId),
    retry: false,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (isSuccess) {
      navigate('/dashboard', { replace: true })
    }
  }, [isSuccess, navigate])

  if (!isSupabaseConfigured()) {
    return (
      <div className="p-8 text-center text-sm text-brand-slate">
        Supabase not configured.{' '}
        <Link to="/login" className="text-brand-primary">
          Login
        </Link>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="p-8 text-center text-sm text-brand-slate">
        Sign in to finish setup.{' '}
        <Link to="/login-poc" className="font-semibold text-brand-primary">
          POC login
        </Link>
      </div>
    )
  }

  if (!sessionId) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-brand-slate">Missing session_id in URL.</p>
        <p className="mt-2 text-xs text-brand-slate-light">
          Set CHECKOUT_SUCCESS_URL to: …/billing/checkout-return?session_id=
          {'{CHECKOUT_SESSION_ID}'}
        </p>
        <Button asChild className="mt-4 rounded-xl">
          <Link to="/plans">Back to plans</Link>
        </Button>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm font-medium text-red-600">
          {error instanceof Error ? error.message : 'Sync failed'}
        </p>
        <Button asChild variant="outline" className="mt-4 rounded-xl">
          <Link to="/plans">Try again</Link>
        </Button>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-border border-t-brand-primary" />
        <p className="text-sm text-brand-slate">Confirming subscription…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[30vh] items-center justify-center text-sm text-brand-slate">
      Redirecting…
    </div>
  )
}
