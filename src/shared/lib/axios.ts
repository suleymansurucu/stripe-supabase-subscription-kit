/**
 * Axios client stub — used by billing.api.ts for the non-Supabase API path.
 *
 * When `isSupabaseConfigured()` returns true (i.e., VITE_SUPABASE_URL is set),
 * all billing calls go through Edge Functions via supabase-edge.ts and this
 * client is never called. Replace with your own REST API base URL if needed.
 */
import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})
