import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/components/ui/dialog'
import { PaymentElementForm } from './payment-element-form'

interface UpdateCardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** SetupIntent client_secret from billing-create-setup-intent */
  clientSecret: string
  onSuccess: (paymentMethodId: string) => void
  onError: (message: string) => void
}

export function UpdateCardModal({
  open,
  onOpenChange,
  clientSecret,
  onSuccess,
  onError,
}: UpdateCardModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update payment method</DialogTitle>
          <DialogDescription>
            Your new card will be used for all future charges on this subscription.
          </DialogDescription>
        </DialogHeader>

        <PaymentElementForm
          clientSecret={clientSecret}
          onSuccess={onSuccess}
          onError={onError}
          submitLabel="Save new card"
          loadingLabel="Saving…"
        />
      </DialogContent>
    </Dialog>
  )
}
