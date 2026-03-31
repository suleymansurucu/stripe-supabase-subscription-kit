import { Link, Navigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuthStore } from '@/app/store/auth.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Logo } from '@/shared/components/logo'
import { isSupabaseConfigured } from '@/shared/lib/supabase-client'
import { pocLoginSchema, type PocLoginFormValues } from '../schemas/register.schema'
import { usePocSignIn } from '../hooks/use-poc-sign-in'

export function PocLoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { mutate, isPending, error } = usePocSignIn()

  const form = useForm<PocLoginFormValues>({
    resolver: zodResolver(pocLoginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (!isSupabaseConfigured()) {
    return <Navigate to="/login" replace />
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const errMsg = error instanceof Error ? error.message : null

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-bg">
      <div
        className="pointer-events-none fixed -right-16 -top-24 h-48 w-48 rounded-full md:-right-28 md:-top-36 md:h-96 md:w-96"
        style={{ background: 'rgba(255, 107, 53, 0.07)' }}
      />
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="mb-8">
          <Logo className="h-28 w-auto md:h-36 lg:h-44" />
        </div>
        <div
          className="w-full max-w-[440px] rounded-2xl border border-brand-border bg-white p-8"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
        >
          <h1 className="font-sora text-[26px] font-extrabold text-brand-navy">Sign in</h1>
          <p className="mt-1.5 text-sm text-brand-slate">Supabase Auth — Stripe billing flow</p>

          {errMsg && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errMsg}
            </div>
          )}

          <form
            onSubmit={form.handleSubmit((v) => mutate(v))}
            className="mt-6 space-y-4"
          >
            <div>
              <Label htmlFor="poc-email" className="text-[11px] font-bold uppercase tracking-wider text-brand-slate">
                Email
              </Label>
              <Input id="poc-email" type="email" className="mt-1.5 rounded-xl border-brand-border" {...form.register('email')} />
              {form.formState.errors.email && (
                <p className="mt-1 text-xs text-red-500">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="poc-password" className="text-[11px] font-bold uppercase tracking-wider text-brand-slate">
                Password
              </Label>
              <Input id="poc-password" type="password" className="mt-1.5 rounded-xl border-brand-border" {...form.register('password')} />
              {form.formState.errors.password && (
                <p className="mt-1 text-xs text-red-500">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button
              type="submit"
              disabled={isPending}
              className="w-full rounded-xl py-6 text-[15px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #FF6B35, #FF3366)', border: 'none' }}
            >
              {isPending ? 'Signing in…' : 'Sign in →'}
            </Button>
          </form>
        </div>
        <p className="mt-5 text-sm text-brand-slate">
          New here?{' '}
          <Link to="/register" className="font-bold text-brand-primary hover:underline">
            Create account
          </Link>
        </p>
      </div>
    </div>
  )
}
