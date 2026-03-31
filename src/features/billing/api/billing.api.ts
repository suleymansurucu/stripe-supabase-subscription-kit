import { apiClient } from '@/shared/lib/axios'
import type { BillingSubscription, PaymentMethod, Invoice } from '@/shared/types'

export const billingApi = {
  getSubscription: async (): Promise<BillingSubscription> => {
    const { data } = await apiClient.get<{ data: BillingSubscription }>('/billing/subscription')
    return data.data
  },

  cancelSubscription: async (): Promise<void> => {
    await apiClient.post('/billing/cancel')
  },

  getPaymentMethod: async (): Promise<PaymentMethod> => {
    const { data } = await apiClient.get<{ data: PaymentMethod }>('/billing/payment-method')
    return data.data
  },

  updatePaymentMethod: async (payload: Partial<PaymentMethod>): Promise<PaymentMethod> => {
    const { data } = await apiClient.put<{ data: PaymentMethod }>('/billing/payment-method', payload)
    return data.data
  },

  getInvoices: async (): Promise<Invoice[]> => {
    const { data } = await apiClient.get<{ data: Invoice[] }>('/billing/invoices')
    return data.data
  },
}
