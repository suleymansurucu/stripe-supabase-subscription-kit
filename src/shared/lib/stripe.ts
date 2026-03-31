import { loadStripe } from '@stripe/stripe-js'

const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined

/**
 * Singleton Stripe.js promise — import this wherever you need stripe.
 * Returns null when VITE_STRIPE_PUBLISHABLE_KEY is not set (POC disabled).
 */
export const stripePromise = key ? loadStripe(key) : null
