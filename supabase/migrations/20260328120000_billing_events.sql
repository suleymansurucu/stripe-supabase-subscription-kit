-- Webhook idempotency + audit log (service role only; no RLS needed)
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text not null,
  payload jsonb,
  processed_at timestamptz not null default now()
);

create index if not exists billing_events_type_idx on public.billing_events (type);
