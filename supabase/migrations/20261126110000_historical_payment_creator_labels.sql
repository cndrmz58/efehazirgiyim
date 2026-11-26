create table public.payment_historical_creator_labels (
  organization_id uuid primary key references public.organizations (id),
  through_created_at timestamptz not null check (isfinite(through_created_at)),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  assigned_at timestamptz not null default now()
);

alter table public.payment_historical_creator_labels enable row level security;
revoke all on public.payment_historical_creator_labels from public, anon, authenticated, service_role;
grant select on public.payment_historical_creator_labels to authenticated;

create policy read_payment_historical_creator_labels on public.payment_historical_creator_labels
  for select to authenticated
  using (private.has_payment_access(organization_id, false));
