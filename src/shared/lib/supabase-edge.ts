/**
 * Call Supabase Edge Functions with the logged-in user's JWT (same contract as Postman).
 */
export async function invokeEdgeFunction<T = unknown>(
  accessToken: string,
  functionName: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const base = import.meta.env.VITE_SUPABASE_URL
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!base || !anon) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing')
  }

  const method = options.method ?? (options.body !== undefined ? 'POST' : 'GET')
  const res = await fetch(`${base.replace(/\/$/, '')}/functions/v1/${functionName}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anon,
      ...(method !== 'GET' && options.body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body:
      method !== 'GET' && options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  })

  const json = (await res.json()) as Record<string, unknown> & { error?: string }
  if (!res.ok) {
    const msg =
      typeof json.error === 'string' ? json.error : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return json as T
}
