-- Run against a disposable, migrated Supabase database as its owner.
begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003');

insert into public.organizations (id, name) values
  ('00000000-0000-4000-8000-000000000011', 'Test A'),
  ('00000000-0000-4000-8000-000000000012', 'Test B');

insert into public.departments (id, organization_id, name) values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000011', 'Assigned'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000011', 'Unassigned'),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000012', 'Separate organization');

insert into public.organization_memberships values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'member', true),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', 'admin', true);

insert into public.department_memberships values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000001', 'viewer');

set local role anon;
do $$ begin
  if has_table_privilege(current_user, 'public.organizations', 'SELECT')
    or has_table_privilege(current_user, 'public.departments', 'SELECT')
    or has_table_privilege(current_user, 'public.organization_memberships', 'SELECT')
    or has_table_privilege(current_user, 'public.department_memberships', 'SELECT')
  then raise exception 'Anonymous privileges exposed'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$ begin
  if (select array_agg(name) from public.departments) is distinct from array['Assigned']
    or (select array_agg(name) from public.organizations) is distinct from array['Test A']
    or (select array_agg(role) from public.organization_memberships) is distinct from array['member']
    or (select array_agg(role) from public.department_memberships) is distinct from array['viewer']
  then raise exception 'Member visibility is not isolated'; end if;
  begin
    update public.organization_memberships set role = 'admin';
    raise exception 'Member unexpectedly has write access';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$ begin
  if (select array_agg(name order by name) from public.departments) is distinct from array['Assigned', 'Unassigned']
    or (select array_agg(name) from public.organizations) is distinct from array['Test A']
  then raise exception 'Admin visibility is not isolated'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
do $$ begin
  if exists (select from public.organizations) or exists (select from public.departments)
  then raise exception 'An Auth account without membership can read data'; end if;
end $$;

reset role;
update public.organization_memberships set active = false where role = 'member';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$ begin
  if exists (select from public.organizations) or exists (select from public.departments)
    or exists (select from public.organization_memberships) or exists (select from public.department_memberships)
  then raise exception 'Suspended membership still grants access'; end if;
end $$;

rollback;
