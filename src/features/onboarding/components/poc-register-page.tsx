import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ShieldCheck } from 'lucide-react'
import { useAuthStore } from '@/app/store/auth.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Logo } from '@/shared/components/logo'
import { isSupabaseConfigured } from '@/shared/lib/supabase-client'
import { STRIPE_PLAN_OPTIONS, formatPlanPrice } from '@/shared/constants/stripe-plans'
import { pocRegisterSchema, type PocRegisterFormValues } from '../schemas/register.schema'
import { usePocSignUp } from '../hooks/use-poc-sign-up'
import { applySupabaseSessionToStore } from '@/app/lib/apply-supabase-session'
import { invokeEdgeFunction } from '@/shared/lib/supabase-edge'
import { PaymentElementForm } from '@/features/billing/components/payment-element-form'

type Step = 'account' | 'payment'

interface SetupIntentResponse {
  clientSecret: string
}

interface SubscribeResponse {
  stripeSubscriptionId: string
  status: string
}

export function PocRegisterPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState<Step>('account')
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false)
  // Prevents the isAuthenticated guard from firing while signup + SetupIntent is in progress
  const [isInSignupFlow, setIsInSignupFlow] = useState(false)

  const { mutate: signUp, isPending: isSigningUp } = usePocSignUp()

  const selectedPriceId = searchParams.get('plan') ?? null
  const selectedPlan = selectedPriceId
    ? (STRIPE_PLAN_OPTIONS.find((p) => p.priceId === selectedPriceId) ?? null)
    : null

  const form = useForm<PocRegisterFormValues>({
    resolver: zodResolver(pocRegisterSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  })

  if (!isSupabaseConfigured()) return <Navigate to="/login" replace />

  // Only show "already signed in" when not in the middle of the signup flow
  if (isAuthenticated && !isInSignupFlow) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-bg px-4">
        <p className="text-sm text-brand-slate">You are already signed in.</p>
        <Link to="/plans" className="mt-3 font-semibold text-brand-primary">
          Choose a plan
        </Link>
        <Link to="/dashboard" className="mt-2 text-sm text-brand-slate">
          Go to dashboard
        </Link>
      </div>
    )
  }

  // ── Step 1: Account creation ─────────────────────────────────────────────────
  const onAccountSubmit = (values: PocRegisterFormValues) => {
    setFormError(null)
    setNeedsEmailConfirm(false)
    setIsInSignupFlow(true)

    signUp(
      { email: values.email, password: values.password, fullName: values.fullName },
      {
        onSuccess: async (data) => {
          if (!data.session) {
            setNeedsEmailConfirm(true)
            return
          }

          await applySupabaseSessionToStore(data.session)
          const token = data.session.access_token

          // Create SetupIntent to collect payment method in step 2
          try {
            const result = await invokeEdgeFunction<SetupIntentResponse>(
              token,
              'billing-create-setup-intent',
              { body: {} },
            )
            setSessionToken(token)
            setSetupClientSecret(result.clientSecret)
            setStep('payment')
          } catch (err) {
            setIsInSignupFlow(false)
            setFormError(err instanceof Error ? err.message : 'Failed to prepare payment form.')
          }
        },
        onError: (err) => {
          setIsInSignupFlow(false)
          setFormError(err instanceof Error ? err.message : 'Sign up failed.')
        },
      },
    )
  }

  // ── Step 2: Payment confirmed ────────────────────────────────────────────────
  const onPaymentSuccess = async (paymentMethodId: string) => {
    if (!sessionToken) return

    try {
      // 1. Set PM as default on Stripe customer
      await invokeEdgeFunction(sessionToken, 'billing-update-default-pm', {
        body: { paymentMethodId },
      })

      // 2. Create subscription if a plan was pre-selected
      if (selectedPriceId) {
        await invokeEdgeFunction<SubscribeResponse>(sessionToken, 'billing-subscribe', {
          body: { priceId: selectedPriceId, paymentMethodId },
        })
      }

      // 3. Navigate to dashboard — subscription is trialing
      window.location.replace('/dashboard')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to start subscription.')
    }
  }

  // ── Shared layout wrapper ────────────────────────────────────────────────────
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
          <Logo className="h-28 w-auto md:h-36 lg:h-44" />
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-3">
          <StepDot number={1} active={step === 'account'} done={step === 'payment'} label="Account" />
          <div className="h-px w-8 bg-brand-border" />
          <StepDot number={2} active={step === 'payment'} done={false} label="Payment" />
        </div>

        <div
          className="w-full max-w-[440px] rounded-2xl border border-brand-border bg-white p-8"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
        >
          {step === 'account' ? (
            <>
              <div className="mb-6">
                <h1 className="font-sora text-[26px] font-extrabold text-brand-navy">
                  Create your account
                </h1>
                <p className="mt-1.5 text-sm text-brand-slate">
                  {selectedPlan
                    ? 'First, set up your account — then add your payment method.'
                    : 'Sign up to get started. You can pick a plan after.'}
                </p>
              </div>

              {/* Selected plan banner */}
              {selectedPlan && (
                <div className="mb-5 flex items-center justify-between rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                      Selected plan
                    </p>
                    <p className="mt-0.5 font-sora text-sm font-extrabold text-brand-navy">
                      {selectedPlan.name}{' '}
                      <span className="font-normal text-brand-slate">
                        {selectedPlan.interval === 'month' ? 'Monthly' : 'Yearly'}
                      </span>
                    </p>
                    <p className="text-xs text-brand-slate">
                      {formatPlanPrice(selectedPlan.amountUsd, selectedPlan.interval)} ·{' '}
                      <span className="text-green-600">
                        {selectedPlan.trialDays}-day free trial
                      </span>
                    </p>
                  </div>
                  <Link
                    to="/plans"
                    className="text-xs font-semibold text-brand-primary hover:underline"
                  >
                    Change
                  </Link>
                </div>
              )}

              {needsEmailConfirm && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Check your inbox to confirm your email, then{' '}
                  <Link className="font-semibold underline" to="/login-poc">
                    sign in here
                  </Link>
                  .
                </div>
              )}

              {formError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {formError}
                </div>
              )}

              <form onSubmit={form.handleSubmit(onAccountSubmit)} className="space-y-4">
                <FormField label="Full name" id="fullName" error={form.formState.errors.fullName?.message}>
                  <Input
                    id="fullName"
                    className="mt-1.5 rounded-xl border-brand-border"
                    {...form.register('fullName')}
                  />
                </FormField>
                <FormField label="Email" id="email" error={form.formState.errors.email?.message}>
                  <Input
                    id="email"
                    type="email"
                    className="mt-1.5 rounded-xl border-brand-border"
                    {...form.register('email')}
                  />
                </FormField>
                <FormField label="Password" id="password" error={form.formState.errors.password?.message}>
                  <Input
                    id="password"
                    type="password"
                    className="mt-1.5 rounded-xl border-brand-border"
                    {...form.register('password')}
                  />
                </FormField>
                <FormField
                  label="Confirm password"
                  id="confirmPassword"
                  error={form.formState.errors.confirmPassword?.message}
                >
                  <Input
                    id="confirmPassword"
                    type="password"
                    className="mt-1.5 rounded-xl border-brand-border"
                    {...form.register('confirmPassword')}
                  />
                </FormField>
                <Button
                  type="submit"
                  disabled={isSigningUp}
                  className="mt-2 w-full rounded-xl py-6 text-[15px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #FF6B35, #FF3366)', border: 'none' }}
                >
                  {isSigningUp ? 'Creating account…' : 'Continue to payment →'}
                </Button>
              </form>
            </>
          ) : (
            // ── Step 2: Payment ──────────────────────────────────────────────
            <>
              <div className="mb-6">
                <h1 className="font-sora text-[26px] font-extrabold text-brand-navy">
                  Add payment method
                </h1>
                <p className="mt-1.5 text-sm text-brand-slate">
                  {selectedPlan
                    ? `Your ${selectedPlan.trialDays}-day free trial starts now. You won't be charged until the trial ends.`
                    : 'Save a payment method to use when you subscribe to a plan.'}
                </p>
              </div>

              {/* Plan confirmation */}
              {selectedPlan && (
                <div className="mb-5 rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                      Subscribing to
                    </p>
                    <span className="text-xs font-semibold text-green-600">
                      {selectedPlan.trialDays}-day trial
                    </span>
                  </div>
                  <p className="mt-0.5 font-sora text-sm font-extrabold text-brand-navy">
                    {selectedPlan.name}{' '}
                    <span className="font-normal text-brand-slate">
                      {selectedPlan.interval === 'month' ? 'Monthly' : 'Yearly'} —{' '}
                      {formatPlanPrice(selectedPlan.amountUsd, selectedPlan.interval)}
                    </span>
                  </p>
                </div>
              )}

              {formError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {formError}
                </div>
              )}

              {setupClientSecret && (
                <PaymentElementForm
                  clientSecret={setupClientSecret}
                  onSuccess={onPaymentSuccess}
                  onError={setFormError}
                  submitLabel={
                    selectedPlan
                      ? `Start ${selectedPlan.trialDays}-day free trial`
                      : 'Save payment method'
                  }
                  loadingLabel="Setting up subscription…"
                >
                  {/* Trust badge */}
                  <div className="flex items-center justify-center gap-1.5 text-xs text-brand-slate-light">
                    <ShieldCheck size={13} className="text-emerald-500" />
                    {selectedPlan
                      ? `No charge until ${new Date(
                          Date.now() + selectedPlan.trialDays * 86_400_000,
                        ).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
                      : 'You control when you subscribe'}
                  </div>
                </PaymentElementForm>
              )}
            </>
          )}
        </div>

        {step === 'account' && (
          <>
            <p className="mt-5 text-sm text-brand-slate">
              Already have an account?{' '}
              <Link to="/login-poc" className="font-bold text-brand-primary hover:underline">
                Sign in
              </Link>
            </p>
            {!selectedPlan && (
              <p className="mt-2 text-sm text-brand-slate">
                <Link to="/plans" className="font-semibold text-brand-primary hover:underline">
                  ← See plans first
                </Link>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Step indicator dot ───────────────────────────────────────────────────────

function StepDot({
  number,
  active,
  done,
  label,
}: {
  number: number
  active: boolean
  done: boolean
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
          done
            ? 'bg-emerald-500 text-white'
            : active
              ? 'bg-brand-primary text-white'
              : 'bg-gray-100 text-brand-slate'
        }`}
      >
        {done ? '✓' : number}
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-slate">
        {label}
      </span>
    </div>
  )
}

// ─── Reusable form field wrapper ─────────────────────────────────────────────

function FormField({
  label,
  id,
  error,
  children,
}: {
  label: string
  id: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label
        htmlFor={id}
        className="text-[11px] font-bold uppercase tracking-wider text-brand-slate"
      >
        {label}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
