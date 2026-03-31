import { useState } from 'react'
import { Navigate, useNavigate, Link } from 'react-router'
import { useAuthStore } from '@/app/store/auth.store'
import { Button } from '@/shared/components/ui/button'
import { Logo } from '@/shared/components/logo'
import {
  getPlansByGroup,
  formatPlanPrice,
  type PlanInterval,
  type StripePlanOption,
} from '@/shared/constants/stripe-plans'
import { isSupabaseConfigured } from '@/shared/lib/supabase-client'
import { cn } from '@/shared/lib/utils'

export function PlansPage() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [interval, setInterval] = useState<PlanInterval>('month')

  if (!isSupabaseConfigured()) {
    return <Navigate to="/login" replace />
  }

  const plans = getPlansByGroup(interval)

  function handleSelectPlan(plan: StripePlanOption) {
    if (isAuthenticated) {
      // Already signed in — go to custom checkout page
      navigate(`/checkout?plan=${plan.priceId}`)
    } else {
      // Not signed in — carry plan selection into register
      navigate(`/register?plan=${plan.priceId}`)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-bg">
      {/* Background blobs */}
      <div
        className="pointer-events-none fixed -right-16 -top-24 h-48 w-48 rounded-full md:-right-28 md:-top-36 md:h-96 md:w-96"
        style={{ background: 'rgba(255, 107, 53, 0.07)' }}
      />
      <div
        className="pointer-events-none fixed -bottom-16 -left-12 h-40 w-40 rounded-full md:-bottom-28 md:-left-20 md:h-80 md:w-80"
        style={{ background: 'rgba(255, 51, 102, 0.06)' }}
      />

      <div className="relative mx-auto max-w-5xl px-4 py-12">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center text-center">
          <Link to="/register">
            <Logo className="mb-6 h-20 w-auto" />
          </Link>
          <h1 className="font-sora text-3xl font-extrabold text-brand-navy md:text-4xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-3 max-w-md text-sm text-brand-slate">
            Start with a{' '}
            <span className="font-semibold text-brand-primary">14-day free trial</span> — no credit
            card charge until the trial ends. Cancel anytime.
          </p>

          {/* Interval toggle */}
          <div className="mt-6 inline-flex items-center gap-1 rounded-xl border border-brand-border bg-white p-1 shadow-sm">
            <button
              onClick={() => setInterval('month')}
              className={cn(
                'rounded-lg px-5 py-2 text-sm font-semibold transition-colors',
                interval === 'month'
                  ? 'bg-brand-primary text-white shadow'
                  : 'text-brand-slate hover:text-brand-navy',
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval('year')}
              className={cn(
                'rounded-lg px-5 py-2 text-sm font-semibold transition-colors',
                interval === 'year'
                  ? 'bg-brand-primary text-white shadow'
                  : 'text-brand-slate hover:text-brand-navy',
              )}
            >
              Yearly
              <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                Save ~17%
              </span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid gap-6 sm:grid-cols-2">
          {plans.map((plan) => {
            const isPro = plan.name === 'Pro'
            return (
              <div
                key={plan.priceId}
                className={cn(
                  'flex flex-col rounded-2xl border bg-white p-8',
                  isPro
                    ? 'border-brand-primary/30 shadow-lg ring-2 ring-brand-primary/20'
                    : 'border-brand-border shadow-sm',
                )}
              >
                {isPro && (
                  <span className="mb-3 inline-block self-start rounded-full bg-brand-primary/10 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-brand-primary">
                    Most popular
                  </span>
                )}

                <p className="font-sora text-xl font-extrabold text-brand-navy">{plan.name}</p>
                <p className="mt-1 text-sm text-brand-slate">{plan.description}</p>

                <div className="mt-5 flex items-end gap-1">
                  <span className="font-sora text-4xl font-extrabold text-brand-navy">
                    {formatPlanPrice(plan.amountUsd, plan.interval)}
                  </span>
                  {plan.interval === 'year' && (
                    <span className="mb-1 text-xs text-brand-slate-light">billed yearly</span>
                  )}
                </div>

                <p className="mt-1.5 text-xs text-green-600">
                  {plan.trialDays}-day free trial included
                </p>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-brand-slate">
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  className="mt-8 w-full rounded-xl py-5 text-[15px] font-bold text-white"
                  style={
                    isPro
                      ? { background: 'linear-gradient(135deg, #FF6B35, #FF3366)', border: 'none' }
                      : {}
                  }
                  variant={isPro ? 'default' : 'outline'}
                  onClick={() => handleSelectPlan(plan)}
                >
                  {`Start ${plan.trialDays}-day trial`}
                </Button>
              </div>
            )
          })}
        </div>

        {/* Test card hint */}
        <p className="mt-8 text-center text-xs text-brand-slate-light">
          Test card:{' '}
          <code className="rounded bg-gray-100 px-1 font-mono">4242 4242 4242 4242</code> — any
          future expiry, any CVC.
        </p>

        {/* Auth links */}
        <div className="mt-6 text-center text-sm text-brand-slate">
          {isAuthenticated ? (
            <Link to="/dashboard" className="font-semibold text-brand-primary hover:underline">
              Back to dashboard →
            </Link>
          ) : (
            <>
              Already have an account?{' '}
              <Link to="/login-poc" className="font-bold text-brand-primary hover:underline">
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
