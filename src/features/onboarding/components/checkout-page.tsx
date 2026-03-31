import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams, Link } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { useAuthStore } from '@/app/store/auth.store'
import { Logo } from '@/shared/components/logo'
import { isSupabaseConfigured } from '@/shared/lib/supabase-client'
import { invokeEdgeFunction } from '@/shared/lib/supabase-edge'
import { STRIPE_PLAN_OPTIONS, formatPlanPrice } from '@/shared/constants/stripe-plans'
import { PaymentElementForm } from '@/features/billing/components/payment-element-form'
import { applySupabaseSessionToStore } from '@/app/lib/apply-supabase-session'
import { getSupabaseBrowserClient } from '@/shared/lib/supabase-client'

interface SetupIntentResponse { clientSecret: string }
interface SubscribeResponse { stripeSubscriptionId: string; status: string }

export function CheckoutPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = useAuthStore((s) => s.token)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const priceId = searchParams.get('plan')
  const plan = priceId ? STRIPE_PLAN_OPTIONS.find((p) => p.priceId === priceId) ?? null : null

  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Refresh Supabase session so token is fresh, then create SetupIntent
  useEffect(() => {
    if (!isAuthenticated || !priceId) return

    async function prepare() {
      setIsLoading(true)
      setError(null)
      try {
        // Refresh token if using Supabase
        let activeToken = token
        if (isSupabaseConfigured()) {
          const sb = getSupabaseBrowserClient()
          if (sb) {
            const { data } = await sb.auth.getSession()
            if (data.session) {
              await applySupabaseSessionToStore(data.session)
              activeToken = data.session.access_token
            }
          }
        }

        if (!activeToken) throw new Error('Not authenticated')

        const result = await invokeEdgeFunction<SetupIntentResponse>(
          activeToken,
          'billing-create-setup-intent',
          { body: {} },
        )
        setClientSecret(result.clientSecret)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load payment form.')
      } finally {
        setIsLoading(false)
      }
    }

    void prepare()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isSupabaseConfigured()) return <Navigate to="/login" replace />
  if (!isAuthenticated) return <Navigate to={`/register?plan=${priceId ?? ''}`} replace />
  if (!plan) return <Navigate to="/plans" replace />

  async function handlePaymentSuccess(paymentMethodId: string) {
    const activeToken = useAuthStore.getState().token
    if (!activeToken) return

    try {
      // 1. Set as default payment method
      await invokeEdgeFunction(activeToken, 'billing-update-default-pm', {
        body: { paymentMethodId },
      })

      // 2. Create subscription with this plan + payment method
      await invokeEdgeFunction<SubscribeResponse>(activeToken, 'billing-subscribe', {
        body: { priceId, paymentMethodId },
      })

      // 3. Refresh billing state then go to dashboard
      window.location.replace('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start subscription.')
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-bg">
      <div
        className="pointer-events-none fixed -right-16 -top-24 h-48 w-48 rounded-full md:-right-28 md:-top-36 md:h-96 md:w-96"
        style={{ background: 'rgba(255, 107, 53, 0.07)' }}
      />
      <div
        className="pointer-events-none fixed -bottom-16 -left-12 h-40 w-40 rounded-full md:-bottom-28 md:-left-20 md:h-80 md:w-80"
        style={{ background: 'rgba(255, 51, 102, 0.06)' }}
      />

      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="mb-8">
          <Logo className="h-24 w-auto md:h-32" />
        </div>

        <div
          className="w-full max-w-[440px] rounded-2xl border border-brand-border bg-white p-8"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
        >
          {/* Plan summary */}
          <div className="mb-6 rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-4">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-primary">
              Subscribing to
            </p>
            <div className="mt-1 flex items-end justify-between">
              <div>
                <p className="font-sora text-lg font-extrabold text-brand-navy">
                  {plan.name}{' '}
                  <span className="text-sm font-normal text-brand-slate">
                    {plan.interval === 'month' ? 'Monthly' : 'Yearly'}
                  </span>
                </p>
                <p className="text-sm text-brand-slate">
                  {formatPlanPrice(plan.amountUsd, plan.interval)}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                  {plan.trialDays}-day free trial
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs text-brand-slate-light">
              Your card will not be charged until{' '}
              {new Date(Date.now() + plan.trialDays * 86_400_000).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
              .
            </p>
          </div>

          <h1 className="mb-5 font-sora text-xl font-extrabold text-brand-navy">
            Payment method
          </h1>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-border border-t-brand-primary" />
            </div>
          )}

          {clientSecret && !isLoading && (
            <PaymentElementForm
              clientSecret={clientSecret}
              onSuccess={handlePaymentSuccess}
              onError={setError}
              submitLabel={`Start ${plan.trialDays}-day free trial`}
              loadingLabel="Starting subscription…"
            >
              <div className="flex items-center justify-center gap-1.5 text-xs text-brand-slate-light">
                <ShieldCheck size={13} className="text-emerald-500" />
                No charge until trial ends — cancel anytime
              </div>
            </PaymentElementForm>
          )}
        </div>

        <div className="mt-5 flex flex-col items-center gap-2">
          <Link to="/plans" className="text-sm text-brand-slate hover:text-brand-primary">
            ← Change plan
          </Link>
        </div>
      </div>
    </div>
  )
}
