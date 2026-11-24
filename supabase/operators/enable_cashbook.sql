-- Run as database owner after the cashbook migration. No accounts or memberships are created.
do $$
declare
  accountant_id uuid;
  target_org uuid;
begin
  select id into strict accountant_id from auth.users
    where lower(email) = 'muhasebe@efehazirgiyim.com' and email_confirmed_at is not null;
  select organization_id into strict target_org from public.organization_memberships
    where user_id = accountant_id and active;

  update public.organization_memberships set cashbook_role = null
    where organization_id = target_org and cashbook_role is not null;
  update public.organization_memberships set cashbook_role = 'accountant'
    where organization_id = target_org and user_id = accountant_id and active;
exception
  when no_data_found then
    raise exception 'Cashbook activation stopped: confirmed Auth account and one active organization membership are required.';
  when too_many_rows then
    raise exception 'Cashbook activation stopped: account or organization is ambiguous. Review memberships before assigning access.';
end $$;
