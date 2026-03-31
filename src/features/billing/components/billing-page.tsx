import { useState } from 'react'
import {
  CreditCard,
  FileText,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Clock,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Settings,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { useBilling } from '../hooks/use-billing'
import { UpdateCardModal } from './update-card-modal'
import { ChangePlanModal } from './change-plan-modal'
import { PauseModal } from './pause-modal'
import type { Invoice } from '@/shared/types'

export function BillingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Billing</h1>
        <p className="mt-0.5 text-sm text-brand-slate">
          Manage your subscription and payment details
        </p>
      </div>

      <SubscriptionSection />
      <PaymentMethodSection />
      <InvoiceSection />
    </div>
  )
}

// ─── Subscription ─────────────────────────────────────────────────────────────

function SubscriptionSection() {
  const {
    subscription,
    isLoadingSubscription,
    cancelSubscription,
    isCanceling,
    changePlan,
    isChangingPlan,
    setPaused,
    isPauseLoading,
  } = useBilling()

  const [cancelOpen, setCancelOpen] = useState(false)
  const [changePlanOpen, setChangePlanOpen] = useState(false)
  const [pauseOpen, setPauseOpen] = useState(false)

  const statusConfig = {
    active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    trialing: { label: 'Trial', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    canceled: { label: 'Canceled', className: 'bg-gray-100 text-gray-600 border-gray-200' },
    past_due: { label: 'Past Due', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

  const renewsOn = subscription ? formatDate(subscription.currentPeriodEnd) : null
  const trialEndsOn = subscription?.trialEnd ? formatDate(subscription.trialEnd) : null
  const amount =
    subscription && subscription.amount > 0
      ? `$${(subscription.amount / 100).toFixed(2)} / ${
          subscription.productName.includes('Yearly') ? 'yr' : 'mo'
        }`
      : null

  const canCancel =
    subscription &&
    ['active', 'trialing'].includes(subscription.status) &&
    !subscription.cancelAtPeriodEnd

  const canPause =
    subscription && ['active', 'trialing'].includes(subscription.status) && !!setPaused

  const canChangePlan =
    subscription && ['active', 'trialing'].includes(subscription.status) && !!changePlan

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-brand-border bg-white">
        <SectionHeader
          icon={Zap}
          title="Current Plan"
          subtitle="Your active subscription details"
        />

        <div className="p-5">
          {isLoadingSubscription ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40 rounded" />
              <Skeleton className="h-4 w-56 rounded" />
              <Skeleton className="h-9 w-48 rounded-xl" />
            </div>
          ) : subscription ? (
            <div className="flex flex-col gap-4">
              {/* Paused banner */}
              {subscription.paused && (
                <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <PauseCircle size={15} className="shrink-0 text-amber-600" />
                  <p className="text-sm text-amber-800">
                    Your subscription is <strong>paused</strong> — no charges until you resume.
                  </p>
                </div>
              )}

              {/* Name + status */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-bold text-gray-900">{subscription.productName}</p>
                    {subscription.status in statusConfig && (
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          statusConfig[subscription.status as keyof typeof statusConfig].className,
                        )}
                      >
                        {statusConfig[subscription.status as keyof typeof statusConfig].label}
                      </span>
                    )}
                    {subscription.paused && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        Paused
                      </span>
                    )}
                  </div>

                  {/* Trial info */}
                  {subscription.status === 'trialing' && trialEndsOn && (
                    <p className="flex items-center gap-1.5 text-sm text-blue-600">
                      <Clock size={13} />
                      Free trial ends{' '}
                      <span className="font-semibold">{trialEndsOn}</span>
                    </p>
                  )}

                  {/* Period / renewal */}
                  <p className="text-sm text-brand-slate">
                    {amount && <>{amount} &mdash; </>}
                    {subscription.status === 'active' && !subscription.paused && renewsOn && (
                      <>
                        renews{' '}
                        <span className="font-medium text-gray-700">{renewsOn}</span>
                      </>
                    )}
                    {subscription.status === 'trialing' && renewsOn && (
                      <>
                        first charge{' '}
                        <span className="font-medium text-gray-700">{renewsOn}</span>
                      </>
                    )}
                    {subscription.status === 'canceled' && renewsOn && (
                      <>
                        access until{' '}
                        <span className="font-medium text-gray-700">{renewsOn}</span>
                      </>
                    )}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {canChangePlan && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 text-sm"
                      onClick={() => setChangePlanOpen(true)}
                    >
                      <RefreshCw size={14} />
                      Change plan
                    </Button>
                  )}

                  {canPause && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-9 gap-1.5 text-sm',
                        subscription.paused
                          ? 'border-emerald-200 text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50'
                          : 'border-amber-200 text-amber-600 hover:border-amber-300 hover:bg-amber-50',
                      )}
                      onClick={() => setPauseOpen(true)}
                      disabled={isPauseLoading}
                    >
                      {isPauseLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : subscription.paused ? (
                        <PlayCircle size={14} />
                      ) : (
                        <PauseCircle size={14} />
                      )}
                      {subscription.paused ? 'Resume' : 'Pause'}
                    </Button>
                  )}

                  {canCancel && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-2 border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50"
                      onClick={() => setCancelOpen(true)}
                    >
                      <AlertTriangle size={14} />
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

              {/* Cancel-at-period-end warning */}
              {subscription.cancelAtPeriodEnd && renewsOn && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
                  <p className="text-sm text-amber-800">
                    Your plan will be canceled on{' '}
                    <span className="font-semibold">{renewsOn}</span>. You still have full access
                    until then.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <EmptyState icon={Zap} message="No active subscription found." />
          )}
        </div>
      </div>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
            <DialogDescription>
              Your plan stays active until the end of the current billing period. You won&apos;t be
              charged again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep plan
            </Button>
            <Button
              className="gap-2 bg-red-500 hover:bg-red-600 font-bold text-white"
              disabled={isCanceling}
              onClick={() => cancelSubscription(undefined, { onSuccess: () => setCancelOpen(false) })}
            >
              {isCanceling && <Loader2 size={14} className="animate-spin" />}
              Yes, cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change plan modal */}
      <ChangePlanModal
        open={changePlanOpen}
        onOpenChange={setChangePlanOpen}
        currentPriceId={subscription?.stripePriceId}
        onConfirm={(priceId) => {
          changePlan?.(priceId)
          setChangePlanOpen(false)
        }}
        isLoading={isChangingPlan ?? false}
      />

      {/* Pause modal */}
      <PauseModal
        open={pauseOpen}
        onOpenChange={setPauseOpen}
        isPaused={subscription?.paused ?? false}
        onConfirm={() => {
          setPaused?.(!(subscription?.paused ?? false))
          setPauseOpen(false)
        }}
        isLoading={isPauseLoading ?? false}
      />
    </>
  )
}

// ─── Payment Method ───────────────────────────────────────────────────────────

const CARD_BRAND_COLORS: Record<string, string> = {
  visa: 'text-blue-700',
  mastercard: 'text-orange-600',
  amex: 'text-sky-700',
  discover: 'text-amber-600',
}

function PaymentMethodSection() {
  const {
    paymentMethod,
    isLoadingPaymentMethod,
    createSetupIntent,
    isCreatingSetupIntent,
    updateDefaultPm,
    isUpdatingPm,
  } = useBilling()

  const [updateOpen, setUpdateOpen] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const brandLabel = paymentMethod
    ? paymentMethod.brand.charAt(0).toUpperCase() + paymentMethod.brand.slice(1)
    : ''

  const expiry = paymentMethod
    ? `${String(paymentMethod.expMonth).padStart(2, '0')} / ${paymentMethod.expYear}`
    : ''

  async function handleOpenUpdateCard() {
    if (!createSetupIntent) return
    setErrorMsg(null)
    try {
      const data = await createSetupIntent()
      setClientSecret(data.clientSecret)
      setUpdateOpen(true)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to open update card.')
    }
  }

  async function handleCardUpdated(paymentMethodId: string) {
    if (!updateDefaultPm) return
    try {
      await updateDefaultPm(paymentMethodId)
      setUpdateOpen(false)
      setClientSecret(null)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save card.')
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-brand-border bg-white">
        <SectionHeader
          icon={CreditCard}
          title="Payment Method"
          subtitle="Your default payment card"
        />

        <div className="p-5">
          {isLoadingPaymentMethod ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-16 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-3 w-28 rounded" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {paymentMethod ? (
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-16 items-center justify-center rounded-xl border border-brand-border bg-gray-50">
                    <CreditCard
                      size={22}
                      className={cn(CARD_BRAND_COLORS[paymentMethod.brand] ?? 'text-gray-600')}
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {brandLabel} •••• {paymentMethod.last4}
                    </p>
                    <p className="text-sm text-brand-slate">Expires {expiry}</p>
                  </div>
                </div>
              ) : (
                <EmptyState icon={CreditCard} message="No payment method on file." />
              )}

              {createSetupIntent && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-sm"
                  onClick={handleOpenUpdateCard}
                  disabled={isCreatingSetupIntent || isUpdatingPm}
                >
                  {isCreatingSetupIntent ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Settings size={14} />
                  )}
                  Update card
                </Button>
              )}
            </div>
          )}

          {errorMsg && (
            <p className="mt-3 text-sm text-red-500">{errorMsg}</p>
          )}
        </div>
      </div>

      {clientSecret && (
        <UpdateCardModal
          open={updateOpen}
          onOpenChange={(open) => {
            setUpdateOpen(open)
            if (!open) setClientSecret(null)
          }}
          clientSecret={clientSecret}
          onSuccess={handleCardUpdated}
          onError={setErrorMsg}
        />
      )}
    </>
  )
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

function InvoiceSection() {
  const { invoices, isLoadingInvoices } = useBilling()

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-border bg-white">
      <SectionHeader icon={FileText} title="Invoice History" subtitle="Download past receipts" />

      {isLoadingInvoices ? (
        <InvoiceSkeleton />
      ) : invoices.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={FileText} message="No invoices yet." />
        </div>
      ) : (
        <>
          <div className="hidden sm:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-border bg-gray-50/80">
                  {['Date', 'Amount', 'Status', ''].map((col) => (
                    <th
                      key={col}
                      className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-brand-slate"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {invoices.map((inv) => (
                  <InvoiceRow key={inv.id} invoice={inv} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col divide-y divide-brand-border sm:hidden">
            {invoices.map((inv) => (
              <InvoiceMobileCard key={inv.id} invoice={inv} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const date = new Date(invoice.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const amount = `$${(invoice.amount / 100).toFixed(2)}`

  return (
    <tr className="transition-colors hover:bg-gray-50/50">
      <td className="px-5 py-3.5 text-sm text-gray-700">{date}</td>
      <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{amount}</td>
      <td className="px-5 py-3.5">
        <InvoiceStatusBadge status={invoice.status} />
      </td>
      <td className="px-5 py-3.5 text-right">
        {invoice.invoiceUrl && invoice.invoiceUrl !== '#' ? (
          <a
            href={invoice.invoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-slate transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <Download size={12} />
            Download
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-brand-slate/40">
            <ExternalLink size={12} />
            Download
          </span>
        )}
      </td>
    </tr>
  )
}

function InvoiceMobileCard({ invoice }: { invoice: Invoice }) {
  const date = new Date(invoice.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const amount = `$${(invoice.amount / 100).toFixed(2)}`

  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div>
        <p className="text-sm font-medium text-gray-900">{amount}</p>
        <p className="text-xs text-brand-slate">{date}</p>
      </div>
      <div className="flex items-center gap-3">
        <InvoiceStatusBadge status={invoice.status} />
        {invoice.invoiceUrl && invoice.invoiceUrl !== '#' ? (
          <a
            href={invoice.invoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg p-1.5 text-brand-slate transition-colors hover:bg-gray-100"
          >
            <Download size={14} />
          </a>
        ) : (
          <span className="rounded-lg p-1.5 text-brand-slate/40">
            <Download size={14} />
          </span>
        )}
      </div>
    </div>
  )
}

function InvoiceStatusBadge({ status }: { status: Invoice['status'] }) {
  const config = {
    paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
    open: { label: 'Open', className: 'bg-amber-50 text-amber-700', icon: AlertTriangle },
    void: { label: 'Void', className: 'bg-gray-100 text-gray-500', icon: FileText },
  }
  const { label, className, icon: Icon } = config[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        className,
      )}
    >
      <Icon size={10} />
      {label}
    </span>
  )
}

function InvoiceSkeleton() {
  return (
    <div className="divide-y divide-brand-border">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="ml-auto h-7 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-center gap-3 border-b border-brand-border px-5 py-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10">
        <Icon size={17} className="text-brand-primary" />
      </div>
      <div>
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-brand-slate">{subtitle}</p>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-brand-slate">
      <Icon size={16} />
      {message}
    </div>
  )
}
