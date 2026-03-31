import type { Session } from '@supabase/supabase-js'
import { useAuthStore } from '@/app/store/auth.store'
import type { User } from '@/shared/types'

/**
 * Reads a Supabase session and writes it into the auth Zustand store.
 * Called after signIn, signUp, or session refresh.
 */
export async function applySupabaseSessionToStore(session: Session): Promise<void> {
  const meta = session.user.user_metadata as Record<string, string> | undefined
  const fullName = meta?.full_name ?? ''
  const [firstName, ...rest] = fullName.split(' ')

  const user: User = {
    id: session.user.id,
    email: session.user.email ?? '',
    name: fullName || undefined,
    firstName: firstName || undefined,
    lastName: rest.join(' ') || undefined,
    permissionLevel: 1,
    role: 'user',
  }

  useAuthStore.getState().setSession(session.access_token, user)
}
