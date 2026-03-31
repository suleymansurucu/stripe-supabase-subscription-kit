import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Loader2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  STRIPE_PLAN_OPTIONS,
  formatPlanPrice,
  type StripePlanOption,
  type PlanInterval,
} from '@/shared/constants/stripe-plans'

interface ChangePlanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPriceId?: string
  onConfirm: (priceId: string) => void
  isLoading: boolean
}

export function ChangePlanModal({
  open,
  onOpenChange,
  currentPriceId,
  onConfirm,
  isLoading,
}: ChangePlanModalProps) {
  const [interval, setInterval] = useState<PlanInterval>('month')
  const [selected, setSelected] = useState<string | null>(null)

  const plans = STRIPE_PLAN_OPTIONS.filter((p) => p.interval === interval)
  const selectedPlan = plans.find((p) => p.priceId === selected)

  function handleConfirm() {
    if (!selected) return
    onConfirm(selected)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>
            Changes take effect immediately. Proration is calculated automatically.
          </DialogDescription>
        </DialogHeader>

        {/* Interval toggle */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-brand-border bg-gray-50 p-1">
          {(['month', 'year'] as PlanInterval[]).map((i) => (
            <button
              key={i}
              onClick={() => { setInterval(i); setSelected(null) }}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors',
                interval === i
                  ? 'bg-white shadow text-brand-navy'
                  : 'text-brand-slate hover:text-brand-navy',
              )}
            >
              {i === 'month' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>

        {/* Plan cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((plan: StripePlanOption) => {
            const isCurrent = plan.priceId === currentPriceId
            const isSelected = plan.priceId === selected

            return (
              <button
                key={plan.priceId}
                onClick={() => !isCurrent && setSelected(plan.priceId)}
                disabled={isCurrent}
                className={cn(
                  'flex flex-col rounded-xl border p-4 text-left transition-all',
                  isCurrent && 'cursor-default border-brand-border bg-gray-50 opacity-60',
                  !isCurrent && isSelected &&
                    'border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/20',
                  !isCurrent && !isSelected &&
                    'border-brand-border bg-white hover:border-brand-primary/40',
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="font-sora font-bold text-brand-navy">{plan.name}</p>
                  {isCurrent && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-1 text-lg font-bold text-brand-navy">
                  {formatPlanPrice(plan.amountUsd, plan.interval)}
                </p>
                <p className="mt-0.5 text-xs text-brand-slate">{plan.description}</p>
              </button>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            disabled={!selected || isLoading}
            onClick={handleConfirm}
            className="gap-2 font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #FF6B35, #FF3366)', border: 'none' }}
          >
            {isLoading && <Loader2 size={14} className="animate-spin" />}
            {selectedPlan
              ? `Switch to ${selectedPlan.name} ${interval === 'month' ? 'Monthly' : 'Yearly'}`
              : 'Select a plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
