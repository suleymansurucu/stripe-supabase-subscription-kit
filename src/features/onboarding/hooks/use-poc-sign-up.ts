import { useMutation } from '@tanstack/react-query'
import { getSupabaseBrowserClient } from '@/shared/lib/supabase-client'
import type { AuthResponse } from '@supabase/supabase-js'

export function usePocSignUp() {
  return useMutation({
    mutationFn: async (payload: {
      email: string
      password: string
      fullName: string
    }): Promise<AuthResponse> => {
      const sb = getSupabaseBrowserClient()
      if (!sb) throw new Error('Supabase is not configured')

      const { data, error } = await sb.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: { data: { full_name: payload.fullName } },
      })
      if (error) throw error
      return data
    },
  })
}
