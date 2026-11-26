-- Run as database owner after both creator-label migrations.
do $$
declare
  accountant_id uuid;
  target_org uuid;
  cutoff constant timestamptz := '2026-11-26 09:53:14.682+00';
begin
  select id into strict accountant_id from auth.users
    where lower(email) = 'muhasebe@efehazirgiyim.com' and email_confirmed_at is not null;
  select organization_id into strict target_org from public.organization_memberships
    where user_id = accountant_id and active;

  if exists (
    select from public.payment_creator_labels
    where organization_id = target_org and user_id = accountant_id and display_name <> 'Muhasebe'
  ) or exists (
    select from public.payment_historical_creator_labels
    where organization_id = target_org
      and (through_created_at <> cutoff or display_name <> 'Muhasebe')
  ) then
    raise exception 'Conflicting payment creator label exists; review the target organization and assignments.';
  end if;

  insert into public.payment_creator_labels (organization_id, user_id, display_name)
    values (target_org, accountant_id, 'Muhasebe')
    on conflict (organization_id, user_id) do nothing;
  insert into public.payment_historical_creator_labels (organization_id, through_created_at, display_name)
    values (target_org, cutoff, 'Muhasebe')
    on conflict (organization_id) do nothing;
  raise notice 'Historical payment display assignment recorded for organization % through %.', target_org, cutoff;
exception
  when no_data_found then
    raise exception 'Activation stopped: confirmed accounting account and one active organization membership are required.';
  when too_many_rows then
    raise exception 'Activation stopped: account or organization is ambiguous. Review memberships.';
end $$;
