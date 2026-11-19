-- Run against a disposable, migrated Supabase database as its owner.
begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000005');

insert into public.organizations (id, name) values
  ('00000000-0000-4000-8000-000000000011', 'Test A'),
  ('00000000-0000-4000-8000-000000000012', 'Test B');

insert into public.departments (id, organization_id, name) values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000011', 'Finance'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000011', 'Sales'),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000012', 'Other');

insert into public.organization_memberships (organization_id, user_id, role, active, payment_role) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'member', true, 'manager'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', 'member', true, 'viewer'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000003', 'member', true, null),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000004', 'admin', true, null),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000005', 'admin', true, null);

-- Department management alone must not grant payment access.
insert into public.department_memberships values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000003', 'manager');

-- Existing records keep their historical department.
insert into public.payments (id, organization_id, department_id, detail, payment_type, amount, status) values
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', 'Finance record', 'rent', 5, 'unpaid'),
  ('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000022', 'Sales record', 'rent', 5, 'unpaid'),
  ('00000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000023', 'Other org', 'rent', 5, 'unpaid');

set local role anon;
do $$ begin
  if has_table_privilege(current_user, 'public.payments', 'SELECT')
    or has_table_privilege(current_user, 'public.payment_audit', 'SELECT')
  then raise exception 'Anonymous payment privileges exposed'; end if;
end $$;
reset role;

-- Payment manager can see all historical records and create without a department.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
declare created public.payments; changed integer;
begin
  if (select count(*) from public.payments) <> 2 then
    raise exception 'Manager cannot see all organization records or sees another organization';
  end if;
  insert into public.payments (organization_id, detail, payment_type, amount, status)
  values ('00000000-0000-4000-8000-000000000011', 'Invoice', 'invoice', '1250.50', 'unpaid')
  returning * into created;
  perform set_config('test.payment_id', created.id::text, true);
  if created.department_id is not null or created.revision <> 1
    or created.created_by <> '00000000-0000-4000-8000-000000000001'
    or created.amount::text <> '1250.50'
  then raise exception 'Insert metadata, scope or amount is wrong'; end if;

  begin
    insert into public.payments (organization_id, detail, payment_type, amount, status)
    values ('00000000-0000-4000-8000-000000000012', 'Foreign', 'invoice', 1, 'unpaid');
    raise exception 'Cross-organization insert succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.payments (organization_id, department_id, detail, payment_type, amount, status)
    values ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', 'Scope', 'invoice', 1, 'unpaid');
    raise exception 'Client selected a department';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.payments (organization_id, detail, payment_type, amount, status, revision)
    values ('00000000-0000-4000-8000-000000000011', 'Spoof', 'invoice', 1, 'unpaid', 9);
    raise exception 'Client chose a revision';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.organization_memberships set payment_role = 'manager';
    raise exception 'Client changed payment permissions';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.payments set organization_id = '00000000-0000-4000-8000-000000000012';
    raise exception 'Client moved payment scope';
  exception when insufficient_privilege then null;
  end;

  update public.payments set status = 'paid', paid_on = date '2026-11-19'
  where id = created.id and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 1 or (select revision from public.payments where id = created.id) <> 2 then
    raise exception 'Revision did not advance';
  end if;
  update public.payments set notes = 'stale' where id = created.id and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Stale update succeeded'; end if;
  update public.payments set notes = 'foreign' where id = '00000000-0000-4000-8000-000000000033';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Cross-organization update succeeded'; end if;

  if exists (select from public.payment_audit) then raise exception 'Non-admin can read audit history'; end if;
  begin
    insert into public.payment_audit (payment_id, organization_id, action)
    values (created.id, created.organization_id, 'insert');
    raise exception 'Client wrote audit history';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Viewer sees all organization payments but cannot add, update, or delete.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
declare changed integer;
begin
  if (select count(*) from public.payments) <> 3 then raise exception 'Viewer visibility is wrong'; end if;
  begin
    insert into public.payments (organization_id, detail, payment_type, amount, status)
    values ('00000000-0000-4000-8000-000000000011', 'Viewer', 'invoice', 1, 'unpaid');
    raise exception 'Viewer inserted a payment';
  exception when insufficient_privilege then null;
  end;
  update public.payments set notes = 'viewer';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Viewer updated a payment'; end if;
  delete from public.payments;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Viewer deleted a payment'; end if;
end $$;

-- A department manager without an explicit payment role cannot access payments.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
do $$ begin
  if exists (select from public.payments) then raise exception 'Unassigned member reads payments'; end if;
  begin
    insert into public.payments (organization_id, detail, payment_type, amount, status)
    values ('00000000-0000-4000-8000-000000000011', 'Unassigned', 'invoice', 1, 'unpaid');
    raise exception 'Unassigned member inserted a payment';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Manager delete requires the latest revision and leaves an audit record.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
declare changed integer;
begin
  delete from public.payments where id = current_setting('test.payment_id')::uuid and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Stale delete succeeded'; end if;
  delete from public.payments where id = current_setting('test.payment_id')::uuid and revision = 2;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Manager could not delete'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
do $$ begin
  if (select count(*) from public.payments) <> 2
    or (select array_agg(action order by id) from public.payment_audit
        where payment_id = current_setting('test.payment_id')::uuid) is distinct from array['insert', 'update', 'delete']
    or (select actor_id from public.payment_audit
        where payment_id = current_setting('test.payment_id')::uuid and action = 'delete') <> '00000000-0000-4000-8000-000000000001'
  then raise exception 'Admin visibility or audit history is wrong'; end if;
  begin
    delete from public.payment_audit;
    raise exception 'Admin deleted audit history';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
do $$ begin
  if (select array_agg(detail) from public.payments) is distinct from array['Other org']
    or exists (select from public.payment_audit where organization_id = '00000000-0000-4000-8000-000000000011')
  then raise exception 'Cross-organization isolation failed'; end if;
end $$;

reset role;
update public.organization_memberships set active = false where user_id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$ begin
  if exists (select from public.payments) then raise exception 'Suspended member reads payments'; end if;
  begin
    insert into public.payments (organization_id, detail, payment_type, amount, status)
    values ('00000000-0000-4000-8000-000000000011', 'Suspended', 'invoice', 1, 'unpaid');
    raise exception 'Suspended member inserted a payment';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
