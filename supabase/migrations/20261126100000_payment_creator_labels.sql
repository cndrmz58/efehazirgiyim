create table public.payment_creator_labels (
  organization_id uuid not null,
  user_id uuid not null,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  primary key (organization_id, user_id),
  foreign key (organization_id, user_id)
    references public.organization_memberships (organization_id, user_id)
);

alter table public.payment_creator_labels enable row level security;
revoke all on public.payment_creator_labels from public, anon, authenticated, service_role;
grant select on public.payment_creator_labels to authenticated;

create policy read_payment_creator_labels on public.payment_creator_labels
  for select to authenticated
  using (private.has_payment_access(organization_id, false));
