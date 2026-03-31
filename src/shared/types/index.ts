// ─── API ──────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message: string
  success: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ─── Auth / User ──────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'user' | 'sub-user'

export type SubscriptionStatus = 'active' | 'trialing' | 'canceled' | 'past_due' | 'incomplete' | 'unpaid'

export interface SubscriptionProduct {
  id: string
  name?: string
}

export interface SubscriptionPlan {
  id?: string
  product: SubscriptionProduct
}

export interface UserSubscription {
  id: string
  status: SubscriptionStatus
  plan: SubscriptionPlan
}

export interface User {
  id: string
  email: string
  name?: string
  firstName?: string
  lastName?: string
  phone?: string
  permissionLevel: number
  role: UserRole
  subscriptions?: UserSubscription[]
  profilePicture?: string
  avatarUrl?: string
  createdAt?: string
}

export interface BillingAddress {
  street?: string
  unit?: string
  state?: string
  city?: string
  zipcode?: string
}

export interface Company {
  id: string
  name: string
  vat_number?: string
  phone?: string
  industry?: string
  website?: string
  logo?: string
  logoUrl?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  zip?: string
  billingAddress?: BillingAddress
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export interface BillingSubscription {
  id: string
  productName: string
  status: 'active' | 'trialing' | 'canceled' | 'past_due'
  amount: number
  currency: string
  currentPeriodEnd: string
  /** Only present during trial period */
  trialEnd?: string
  /** True when the subscription will cancel at period end instead of renewing */
  cancelAtPeriodEnd?: boolean
  /** True when billing is paused (pause_collection active on Stripe) */
  paused?: boolean
  /** Stripe price ID — used for plan change pre-selection */
  stripePriceId?: string
}

export interface PaymentMethod {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  isDefault: boolean
}

export interface Invoice {
  id: string
  date: string
  amount: number
  currency: string
  status: 'paid' | 'open' | 'void'
  invoiceUrl?: string
}
