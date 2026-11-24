alter table public.organization_memberships
  add column cashbook_role text check (cashbook_role = 'accountant');

create unique index one_cashbook_accountant_per_organization
  on public.organization_memberships (organization_id) where cashbook_role = 'accountant';

create function private.has_cashbook_access(target_org uuid, write_required boolean)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org and m.user_id = (select auth.uid())
      and m.active and (not write_required or m.cashbook_role = 'accountant')
  );
$$;

revoke all on function private.has_cashbook_access(uuid, boolean) from public, anon, authenticated;
grant execute on function private.has_cashbook_access(uuid, boolean) to authenticated;

create table public.cashbook_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  entry_on date not null check (isfinite(entry_on) and entry_on between date '0001-01-01' and date '9999-12-31'),
  description text not null check (description ~ '[^[:space:]]' and char_length(description) <= 2000),
  entry_type text not null check (entry_type ~ '[^[:space:]]' and char_length(entry_type) <= 100),
  incoming numeric not null check (incoming >= 0 and incoming < 1000000000000 and scale(incoming) <= 2),
  outgoing numeric not null check (outgoing >= 0 and outgoing < 1000000000000 and scale(outgoing) <= 2),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  check ((incoming > 0 and outgoing = 0) or (outgoing > 0 and incoming = 0))
);

create index on public.cashbook_entries (organization_id, entry_on, id);

create function private.stamp_cashbook_entry()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_at := now();
    new.created_by := auth.uid();
  else
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id then
      raise exception 'Cashbook identity and scope cannot change' using errcode = '42501';
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

create trigger stamp_cashbook_entry before insert or update on public.cashbook_entries
  for each row execute function private.stamp_cashbook_entry();

create table public.cashbook_audit (
  id bigint generated always as identity primary key,
  entry_id uuid not null,
  organization_id uuid not null references public.organizations (id),
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_id uuid references auth.users (id),
  occurred_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index on public.cashbook_audit (organization_id, entry_id);

create function private.audit_cashbook_entry()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.cashbook_audit (entry_id, organization_id, action, actor_id, old_data, new_data)
  values (
    coalesce(new.id, old.id), coalesce(new.organization_id, old.organization_id),
    lower(tg_op), auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

revoke all on function private.stamp_cashbook_entry(), private.audit_cashbook_entry()
  from public, anon, authenticated;

create trigger audit_cashbook_entry after insert or update or delete on public.cashbook_entries
  for each row execute function private.audit_cashbook_entry();

alter table public.cashbook_entries enable row level security;
alter table public.cashbook_audit enable row level security;
revoke all on public.cashbook_entries, public.cashbook_audit from public, anon, authenticated, service_role;
grant select, delete on public.cashbook_entries to authenticated;
grant insert (organization_id, entry_on, description, entry_type, incoming, outgoing)
  on public.cashbook_entries to authenticated;
grant update (entry_on, description, entry_type, incoming, outgoing)
  on public.cashbook_entries to authenticated;
grant select on public.cashbook_audit to authenticated;

create policy read_cashbook on public.cashbook_entries for select to authenticated
  using (private.has_cashbook_access(organization_id, false));
create policy insert_cashbook on public.cashbook_entries for insert to authenticated
  with check (private.has_cashbook_access(organization_id, true));
create policy update_cashbook on public.cashbook_entries for update to authenticated
  using (private.has_cashbook_access(organization_id, true))
  with check (private.has_cashbook_access(organization_id, true));
create policy delete_cashbook on public.cashbook_entries for delete to authenticated
  using (private.has_cashbook_access(organization_id, true));
create policy read_cashbook_audit on public.cashbook_audit for select to authenticated
  using (private.has_active_membership(organization_id, true));
