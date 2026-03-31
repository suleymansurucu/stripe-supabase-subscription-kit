-- Add paused flag to subscriptions (used by billing-pause edge function)
alter table public.subscriptions
  add column if not exists paused boolean not null default false;
