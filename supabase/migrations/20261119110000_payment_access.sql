-- Opens department-scoped payment access with optimistic concurrency and an append-only audit trail.

alter table public.payments
  add column revision integer not null default 1 check (revision > 0),
  add column updated_at timestamptz not null default now(),
  add column created_by uuid references auth.users (id),
  add column updated_by uuid references auth.users (id);

create function private.can_change_payments(target_org uuid, target_department uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.has_active_membership(target_org, true) or (
    private.has_active_membership(target_org, false) and exists (
      select 1 from public.department_memberships m
      where m.organization_id = target_org and m.department_id = target_department
        and m.user_id = (select auth.uid()) and m.role = any (allowed_roles)
    )
  );
$$;

revoke all on function private.can_change_payments(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function private.can_change_payments(uuid, uuid, text[]) to authenticated;

-- Server-owned metadata: clients cannot choose revision, timestamps, actors, or move a record's scope.
create function private.stamp_payment()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_at := now();
    new.created_by := auth.uid();
  else
    if new.id is distinct from old.id
      or new.organization_id is distinct from old.organization_id
      or new.department_id is distinct from old.department_id then
      raise exception 'Payment identity and scope cannot change' using errcode = '42501';
    end if;
    new.revision := old.revision + 1;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger stamp_payment before insert or update on public.payments
  for each row execute function private.stamp_payment();

create table public.payment_audit (
  id bigint generated always as identity primary key,
  payment_id uuid not null,
  organization_id uuid not null references public.organizations (id),
  department_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_id uuid references auth.users (id),
  occurred_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index on public.payment_audit (organization_id, payment_id);

alter table public.payment_audit enable row level security;
revoke all on public.payment_audit from public, anon, authenticated, service_role;
grant select on public.payment_audit to authenticated;
create policy read_payment_audit on public.payment_audit for select to authenticated
  using (private.has_active_membership(organization_id, true));

create function private.audit_payment()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.payment_audit (payment_id, organization_id, department_id, action, actor_id, old_data, new_data)
  values (
    coalesce(new.id, old.id),
    coalesce(new.organization_id, old.organization_id),
    coalesce(new.department_id, old.department_id),
    lower(tg_op),
    auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

revoke all on function private.stamp_payment(), private.audit_payment() from public, anon, authenticated;

create trigger audit_payment after insert or update or delete on public.payments
  for each row execute function private.audit_payment();

grant select, delete on public.payments to authenticated;
grant insert (organization_id, department_id, detail, payment_type, amount, currency, due_on, paid_on, notes, status)
  on public.payments to authenticated;
grant update (detail, payment_type, amount, currency, due_on, paid_on, notes, status)
  on public.payments to authenticated;

create policy read_payments on public.payments for select to authenticated
  using (private.has_department_access(organization_id, department_id));
create policy insert_payments on public.payments for insert to authenticated
  with check (private.can_change_payments(organization_id, department_id, array['manager', 'editor']));
create policy update_payments on public.payments for update to authenticated
  using (private.can_change_payments(organization_id, department_id, array['manager', 'editor']))
  with check (private.can_change_payments(organization_id, department_id, array['manager', 'editor']));
create policy delete_payments on public.payments for delete to authenticated
  using (private.can_change_payments(organization_id, department_id, array['manager']));
