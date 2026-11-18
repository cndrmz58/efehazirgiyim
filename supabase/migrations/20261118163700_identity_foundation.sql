create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(btrim(name)) > 0),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null references auth.users (id),
  role text not null check (role in ('admin', 'member')),
  active boolean not null default false,
  primary key (organization_id, user_id)
);

create table public.department_memberships (
  organization_id uuid not null,
  department_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('manager', 'editor', 'viewer')),
  primary key (organization_id, department_id, user_id),
  foreign key (organization_id, department_id) references public.departments (organization_id, id),
  foreign key (organization_id, user_id) references public.organization_memberships (organization_id, user_id)
);

create index on public.department_memberships (organization_id, user_id);

create function private.has_active_membership(target_org uuid, admin_only boolean)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org and m.user_id = (select auth.uid())
      and m.active and (not admin_only or m.role = 'admin')
  );
$$;

create function private.has_department_access(target_org uuid, target_department uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.has_active_membership(target_org, true) or (
    private.has_active_membership(target_org, false) and exists (
      select 1 from public.department_memberships m
      where m.organization_id = target_org and m.department_id = target_department
        and m.user_id = (select auth.uid())
    )
  );
$$;

revoke all on function private.has_active_membership(uuid, boolean), private.has_department_access(uuid, uuid) from public, anon, authenticated;
grant execute on function private.has_active_membership(uuid, boolean), private.has_department_access(uuid, uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.departments enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.department_memberships enable row level security;

revoke all on public.organizations, public.departments, public.organization_memberships, public.department_memberships from public, anon, authenticated;
grant select on public.organizations, public.departments, public.organization_memberships, public.department_memberships to authenticated;

create policy read_own_organizations on public.organizations for select to authenticated
  using (private.has_active_membership(id, false));
create policy read_accessible_departments on public.departments for select to authenticated
  using (private.has_department_access(organization_id, id));
create policy read_organization_memberships on public.organization_memberships for select to authenticated
  using (private.has_active_membership(organization_id, true)
    or (user_id = (select auth.uid()) and active));
create policy read_department_memberships on public.department_memberships for select to authenticated
  using (private.has_active_membership(organization_id, true)
    or (user_id = (select auth.uid()) and private.has_active_membership(organization_id, false)));
