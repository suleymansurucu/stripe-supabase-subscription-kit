import { useState } from 'react'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import type { Appearance, StripePaymentElementOptions } from '@stripe/stripe-js'
import { Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { stripePromise } from '@/shared/lib/stripe'

// ─── Stripe appearance — matches brand design tokens ─────────────────────────

const appearance: Appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#FF6B35',
    colorBackground: '#ffffff',
    colorText: '#1a2744',
    colorDanger: '#ef4444',
    colorTextSecondary: '#64748b',
    fontFamily: 'system-ui, sans-serif',
    borderRadius: '12px',
    spacingUnit: '5px',
  },
  rules: {
    '.Input': {
      border: '1px solid #e2e8f0',
      boxShadow: 'none',
      fontSize: '14px',
    },
    '.Input:focus': {
      border: '1px solid #FF6B35',
      boxShadow: '0 0 0 3px rgba(255,107,53,0.12)',
      outline: 'none',
    },
    '.Label': {
      fontWeight: '600',
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      color: '#64748b',
    },
    '.Tab': {
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
    },
    '.Tab--selected': {
      border: '1px solid #FF6B35',
      boxShadow: '0 0 0 3px rgba(255,107,53,0.12)',
    },
    '.Tab:hover': {
      border: '1px solid #FF6B35',
    },
  },
}

const paymentElementOptions: StripePaymentElementOptions = {
  layout: 'tabs',
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface PaymentElementFormProps {
  /** SetupIntent or PaymentIntent client_secret */
  clientSecret: string
  /** Called with the payment method ID on success */
  onSuccess: (paymentMethodId: string) => void
  onError: (message: string) => void
  submitLabel?: string
  loadingLabel?: string
  /** Extra content shown above the submit button (e.g. plan summary) */
  children?: React.ReactNode
}

/**
 * Wraps Stripe Elements + PaymentElement in one component.
 * Handles card, Apple Pay, and Google Pay automatically.
 */
export function PaymentElementForm(props: PaymentElementFormProps) {
  if (!stripePromise) {
    return (
      <p className="text-sm text-red-500">
        VITE_STRIPE_PUBLISHABLE_KEY is not set. Add it to .env.development.
      </p>
    )
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret: props.clientSecret, appearance }}
    >
      <PaymentElementFormInner {...props} />
    </Elements>
  )
}

// ─── Inner form (must be inside <Elements>) ───────────────────────────────────

function PaymentElementFormInner({
  onSuccess,
  onError,
  submitLabel = 'Save payment method',
  loadingLabel = 'Processing…',
  children,
}: Omit<PaymentElementFormProps, 'clientSecret'>) {
  const stripe = useStripe()
  const elements = useElements()
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsSubmitting(true)

    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      // redirect: 'if_required' avoids a page redirect for card payments
      // (only bank redirects, etc. will redirect the user)
      redirect: 'if_required',
    })

    if (error) {
      onError(error.message ?? 'Payment failed.')
      setIsSubmitting(false)
      return
    }

    // setupIntent.payment_method is the PM ID (string after confirmation)
    const pmId =
      typeof setupIntent?.payment_method === 'string'
        ? setupIntent.payment_method
        : (setupIntent?.payment_method?.id ?? '')

    onSuccess(pmId)
    // Note: don't setIsSubmitting(false) here — let caller navigate/close
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement options={paymentElementOptions} />

      {children}

      <Button
        type="submit"
        disabled={!stripe || !elements || isSubmitting}
        className="w-full rounded-xl py-5 text-[15px] font-bold text-white"
        style={{ background: 'linear-gradient(135deg, #FF6B35, #FF3366)', border: 'none' }}
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            {loadingLabel}
          </span>
        ) : (
          submitLabel
        )}
      </Button>

      <p className="text-center text-[11px] text-brand-slate-light">
        Secured by{' '}
        <span className="font-semibold text-brand-slate">Stripe</span>. Your card details are never
        stored on our servers.
      </p>
    </form>
  )
}
