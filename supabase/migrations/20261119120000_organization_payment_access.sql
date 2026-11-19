alter table public.organization_memberships
  add column payment_role text check (payment_role in ('manager', 'viewer'));

alter table public.payments alter column department_id drop not null;
alter table public.payment_audit alter column department_id drop not null;

create function private.has_payment_access(target_org uuid, write_required boolean)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org and m.user_id = (select auth.uid())
      and m.active and (
        m.role = 'admin' or m.payment_role = 'manager'
        or (not write_required and m.payment_role = 'viewer')
      )
  );
$$;

revoke all on function private.has_payment_access(uuid, boolean) from public, anon, authenticated;
grant execute on function private.has_payment_access(uuid, boolean) to authenticated;

revoke insert (department_id) on public.payments from authenticated;

drop policy read_payments on public.payments;
drop policy insert_payments on public.payments;
drop policy update_payments on public.payments;
drop policy delete_payments on public.payments;

create policy read_payments on public.payments for select to authenticated
  using (private.has_payment_access(organization_id, false));
create policy insert_payments on public.payments for insert to authenticated
  with check (private.has_payment_access(organization_id, true));
create policy update_payments on public.payments for update to authenticated
  using (private.has_payment_access(organization_id, true))
  with check (private.has_payment_access(organization_id, true));
create policy delete_payments on public.payments for delete to authenticated
  using (private.has_payment_access(organization_id, true));
