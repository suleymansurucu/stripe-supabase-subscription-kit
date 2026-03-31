import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { getSupabaseBrowserClient } from '@/shared/lib/supabase-client'
import { useAuthStore } from '@/app/store/auth.store'
import { applySupabaseSessionToStore } from '@/app/lib/apply-supabase-session'
import type { Session } from '@supabase/supabase-js'

export function usePocSignIn() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (payload: { email: string; password: string }): Promise<Session> => {
      const sb = getSupabaseBrowserClient()
      if (!sb) throw new Error('Supabase is not configured')

      const { data, error } = await sb.auth.signInWithPassword({
        email: payload.email,
        password: payload.password,
      })
      if (error) throw error
      if (!data.session) throw new Error('No session returned')
      return data.session
    },
    onSuccess: async (session) => {
      await applySupabaseSessionToStore(session)
      const hasSub = !!useAuthStore.getState().user?.subscriptions?.length
      navigate(hasSub ? '/dashboard' : '/plans', { replace: true })
    },
  })
}
