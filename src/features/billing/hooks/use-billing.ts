import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { billingApi } from '../api/billing.api'
import { isSupabaseConfigured } from '@/shared/lib/supabase-client'
import { invokeEdgeFunction } from '@/shared/lib/supabase-edge'
import { useAuthStore } from '@/app/store/auth.store'
import { STRIPE_PLAN_OPTIONS } from '@/shared/constants/stripe-plans'
import type { BillingSubscription, PaymentMethod, Invoice } from '@/shared/types'

// ─── POC Edge Function response shapes ────────────────────────────────────────

interface PocOverviewSubscription {
  id: string
  stripe_subscription_id: string
  stripe_price_id: string
  status: string
  current_period_end: string
  trial_end: string | null
  cancel_at_period_end: boolean
  paused?: boolean
}

interface PocOverviewResponse {
  subscription: PocOverviewSubscription | null
}

interface PocPaymentMethodResponse {
  paymentMethod: {
    id: string
    brand: string
    last4: string
    expMonth: number
    expYear: number
  } | null
}

interface PocInvoiceItem {
  id: string
  date: string
  amount: number
  currency: string
  status: string
  invoiceUrl: string | null
}

interface PocInvoicesResponse {
  invoices: PocInvoiceItem[]
}

interface PocPortalResponse {
  portalUrl: string
}

interface PocSetupIntentResponse {
  clientSecret: string
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapPocSubscription(sub: PocOverviewSubscription): BillingSubscription {
  const plan = STRIPE_PLAN_OPTIONS.find((p) => p.priceId === sub.stripe_price_id)
  const productName = plan
    ? `${plan.name} — ${plan.interval === 'month' ? 'Monthly' : 'Yearly'}`
    : 'Subscription'

  return {
    id: sub.id,
    productName,
    status: sub.status as BillingSubscription['status'],
    amount: plan?.amountUsd ?? 0,
    currency: 'usd',
    currentPeriodEnd: sub.current_period_end,
    trialEnd: sub.trial_end ?? undefined,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    paused: sub.paused ?? false,
    stripePriceId: sub.stripe_price_id,
  }
}

function mapPocInvoices(items: PocInvoiceItem[]): Invoice[] {
  return items.map((inv) => ({
    id: inv.id,
    date: inv.date,
    amount: inv.amount,
    currency: inv.currency,
    status: (['paid', 'open', 'void'].includes(inv.status)
      ? inv.status
      : 'void') as Invoice['status'],
    invoiceUrl: inv.invoiceUrl ?? undefined,
  }))
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBilling() {
  const isPoc = isSupabaseConfigured()
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()

  // ── Regular API (disabled in POC mode) ──────────────────────────────────────
  const regularSubscription = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: billingApi.getSubscription,
    enabled: !isPoc,
  })

  const regularPaymentMethod = useQuery({
    queryKey: ['billing', 'payment-method'],
    queryFn: billingApi.getPaymentMethod,
    enabled: !isPoc,
  })

  const regularInvoices = useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: billingApi.getInvoices,
    enabled: !isPoc,
  })

  const regularCancel = useMutation({
    mutationFn: billingApi.cancelSubscription,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] }),
  })

  // ── POC Edge Function queries ────────────────────────────────────────────────
  const pocOverview = useQuery({
    queryKey: ['billing', 'poc-overview'],
    queryFn: () =>
      invokeEdgeFunction<PocOverviewResponse>(token!, 'billing-overview', { method: 'GET' }),
    enabled: isPoc && !!token,
    staleTime: 30_000,
  })

  const pocPaymentMethod = useQuery({
    queryKey: ['billing', 'poc-payment-method'],
    queryFn: () =>
      invokeEdgeFunction<PocPaymentMethodResponse>(token!, 'billing-payment-method', {
        method: 'GET',
      }),
    enabled: isPoc && !!token,
    staleTime: 60_000,
  })

  const pocInvoices = useQuery({
    queryKey: ['billing', 'poc-invoices'],
    queryFn: () =>
      invokeEdgeFunction<PocInvoicesResponse>(token!, 'billing-invoices', { method: 'GET' }),
    enabled: isPoc && !!token,
    staleTime: 60_000,
  })

  // ── POC mutations ────────────────────────────────────────────────────────────
  const pocCancel = useMutation({
    mutationFn: () =>
      invokeEdgeFunction(token!, 'billing-cancel', { body: { atPeriodEnd: true } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billing', 'poc-overview'] }),
  })

  const pocPortal = useMutation({
    mutationFn: () =>
      invokeEdgeFunction<PocPortalResponse>(token!, 'billing-portal', { body: {} }),
    onSuccess: (data) => {
      if (data.portalUrl) window.location.assign(data.portalUrl)
    },
  })

  /** Create SetupIntent to collect a payment method (custom UI flow) */
  const pocCreateSetupIntent = useMutation({
    mutationFn: () =>
      invokeEdgeFunction<PocSetupIntentResponse>(token!, 'billing-create-setup-intent', {
        body: {},
      }),
  })

  /** After SetupIntent confirmed: set new PM as default on customer + subscription */
  const pocUpdateDefaultPm = useMutation({
    mutationFn: (paymentMethodId: string) =>
      invokeEdgeFunction(token!, 'billing-update-default-pm', { body: { paymentMethodId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'poc-payment-method'] })
    },
  })

  /** Change plan (proration applied) */
  const pocChangePlan = useMutation({
    mutationFn: (priceId: string) =>
      invokeEdgeFunction(token!, 'billing-change-plan', {
        body: { priceId, prorationBehavior: 'create_prorations' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'poc-overview'] })
    },
  })

  /** Pause or resume subscription */
  const pocPause = useMutation({
    mutationFn: (pause: boolean) =>
      invokeEdgeFunction(token!, 'billing-pause', { body: { pause } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'poc-overview'] })
    },
  })

  // ── Derive return value ──────────────────────────────────────────────────────
  if (isPoc) {
    const rawSub = pocOverview.data?.subscription ?? null
    const subscription = rawSub ? mapPocSubscription(rawSub) : undefined
    const paymentMethod = pocPaymentMethod.data?.paymentMethod ?? undefined
    const invoices = pocInvoices.data ? mapPocInvoices(pocInvoices.data.invoices) : []

    return {
      subscription,
      isLoadingSubscription: pocOverview.isLoading,
      paymentMethod,
      isLoadingPaymentMethod: pocPaymentMethod.isLoading,
      invoices,
      isLoadingInvoices: pocInvoices.isLoading,

      // Cancel
      cancelSubscription: pocCancel.mutate,
      isCanceling: pocCancel.isPending,

      // Stripe Customer Portal
      openPortal: pocPortal.mutate as () => void,
      isOpeningPortal: pocPortal.isPending,

      // Custom payment UI
      createSetupIntent: pocCreateSetupIntent.mutateAsync,
      isCreatingSetupIntent: pocCreateSetupIntent.isPending,
      updateDefaultPm: pocUpdateDefaultPm.mutateAsync,
      isUpdatingPm: pocUpdateDefaultPm.isPending,

      // Change plan
      changePlan: pocChangePlan.mutate,
      isChangingPlan: pocChangePlan.isPending,

      // Pause / resume
      setPaused: (pause: boolean) => pocPause.mutate(pause),
      isPauseLoading: pocPause.isPending,
    }
  }

  return {
    subscription: regularSubscription.data,
    isLoadingSubscription: regularSubscription.isLoading,
    paymentMethod: regularPaymentMethod.data,
    isLoadingPaymentMethod: regularPaymentMethod.isLoading,
    invoices: regularInvoices.data ?? [],
    isLoadingInvoices: regularInvoices.isLoading,
    cancelSubscription: regularCancel.mutate,
    isCanceling: regularCancel.isPending,
    openPortal: undefined as (() => void) | undefined,
    isOpeningPortal: false,
    createSetupIntent: undefined as
      | (() => Promise<PocSetupIntentResponse>)
      | undefined,
    isCreatingSetupIntent: false,
    updateDefaultPm: undefined as ((pmId: string) => Promise<unknown>) | undefined,
    isUpdatingPm: false,
    changePlan: undefined as ((priceId: string) => void) | undefined,
    isChangingPlan: false,
    setPaused: undefined as ((pause: boolean) => void) | undefined,
    isPauseLoading: false,
  }
}
