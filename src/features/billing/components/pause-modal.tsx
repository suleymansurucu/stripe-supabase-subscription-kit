import { Loader2, PauseCircle, PlayCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'

interface PauseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current pause state of the subscription */
  isPaused: boolean
  onConfirm: () => void
  isLoading: boolean
}

export function PauseModal({
  open,
  onOpenChange,
  isPaused,
  onConfirm,
  isLoading,
}: PauseModalProps) {
  if (isPaused) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100">
              <PlayCircle size={22} className="text-emerald-600" />
            </div>
            <DialogTitle>Resume subscription?</DialogTitle>
            <DialogDescription>
              Your subscription will resume and billing will continue on your normal cycle.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Keep paused
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isLoading}
              className="gap-2 bg-emerald-600 font-bold text-white hover:bg-emerald-700"
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              Yes, resume
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100">
            <PauseCircle size={22} className="text-amber-600" />
          </div>
          <DialogTitle>Pause subscription?</DialogTitle>
          <DialogDescription>
            Your subscription will be paused — invoices are kept as drafts and you won&apos;t be
            charged. You keep full access until the current period ends.
            <br />
            <span className="mt-2 block text-xs text-brand-slate-light">
              You can resume anytime from the billing page.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Keep active
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="gap-2 bg-amber-500 font-bold text-white hover:bg-amber-600"
          >
            {isLoading && <Loader2 size={14} className="animate-spin" />}
            Pause subscription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
