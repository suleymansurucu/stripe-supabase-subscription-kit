import { Routes, Route, Navigate } from 'react-router'
import BillingRoute from '@/pages/billing'
import BillingCheckoutReturn from '@/pages/billing-checkout-return'
import Checkout from '@/pages/checkout'
import { PlansPage } from '@/features/onboarding/components/plans-page'
import { PocLoginPage } from '@/features/onboarding/components/poc-login-page'
import { PocRegisterPage } from '@/features/onboarding/components/poc-register-page'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/plans" replace />} />
      <Route path="/plans" element={<PlansPage />} />
      <Route path="/login-poc" element={<PocLoginPage />} />
      <Route path="/register" element={<PocRegisterPage />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/billing" element={<BillingRoute />} />
      <Route path="/billing/checkout-return" element={<BillingCheckoutReturn />} />
      {/* Alias for Checkout return — configure CHECKOUT_SUCCESS_URL to use either path */}
      <Route path="/billing/return" element={<BillingCheckoutReturn />} />
      {/* Fallback dashboard redirect for post-subscribe flows */}
      <Route path="/dashboard" element={<Navigate to="/billing" replace />} />
    </Routes>
  )
}
