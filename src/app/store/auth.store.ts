import { create } from 'zustand'
import type { User } from '@/shared/types'

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  setSession: (token: string, user: User) => void
  clearSession: () => void
  updateUser: (partial: Partial<User>) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  setSession: (token, user) => set({ token, user, isAuthenticated: true }),
  clearSession: () => set({ token: null, user: null, isAuthenticated: false }),
  updateUser: (partial) =>
    set((s) => ({ user: s.user ? { ...s.user, ...partial } : s.user })),
}))
