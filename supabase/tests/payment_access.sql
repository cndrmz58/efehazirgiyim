-- Run against a disposable, migrated Supabase database as its owner.
begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'), -- editor in Finance
  ('00000000-0000-4000-8000-000000000002'), -- viewer in Finance
  ('00000000-0000-4000-8000-000000000003'), -- manager in Finance
  ('00000000-0000-4000-8000-000000000004'), -- organization admin
  ('00000000-0000-4000-8000-000000000005'); -- admin of another organization

insert into public.organizations (id, name) values
  ('00000000-0000-4000-8000-000000000011', 'Test A'),
  ('00000000-0000-4000-8000-000000000012', 'Test B');

insert into public.departments (id, organization_id, name) values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000011', 'Finance'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000011', 'Sales'),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000012', 'Finance');

insert into public.organization_memberships values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'member', true),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', 'member', true),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000003', 'member', true),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000004', 'admin', true),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000005', 'admin', true);

insert into public.department_memberships values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000001', 'editor'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000002', 'viewer'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000003', 'manager');

insert into public.payments (id, organization_id, department_id, detail, payment_type, amount, status) values
  ('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000022', 'Sales rent', 'rent', 5, 'unpaid'),
  ('00000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000023', 'Other org', 'rent', 5, 'unpaid');

set local role anon;
do $$ begin
  if has_table_privilege(current_user, 'public.payments', 'SELECT')
    or has_table_privilege(current_user, 'public.payment_audit', 'SELECT')
  then raise exception 'Anonymous payment privileges exposed'; end if;
end $$;
reset role;

-- Editor: creates and updates in an assigned department; cannot spoof metadata, move scope, or delete.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
declare
  created public.payments;
  changed integer;
begin
  if exists (select from public.payments) then raise exception 'Editor sees unassigned or foreign payments'; end if;

  insert into public.payments (organization_id, department_id, detail, payment_type, amount, status)
  values ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', 'Invoice', 'invoice', '1250.50', 'unpaid')
  returning * into created;
  perform set_config('test.payment_id', created.id::text, true);
  if created.revision <> 1 or created.created_by <> '00000000-0000-4000-8000-000000000001' or created.amount::text <> '1250.50' then
    raise exception 'Insert metadata or decimal amount is wrong: %', created;
  end if;

  begin
    insert into public.payments (organization_id, department_id, detail, payment_type, amount, status)
    values ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000022', 'Unassigned', 'invoice', 1, 'unpaid');
    raise exception 'Editor inserted into an unassigned department';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.payments (organization_id, department_id, detail, payment_type, amount, status)
    values ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000023', 'Foreign', 'invoice', 1, 'unpaid');
    raise exception 'Editor inserted into another organization';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.payments (organization_id, department_id, detail, payment_type, amount, status, revision)
    values ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', 'Spoof', 'invoice', 1, 'unpaid', 9);
    raise exception 'Client chose a revision';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.payments set department_id = '00000000-0000-4000-8000-000000000022';
    raise exception 'Client moved a payment';
  exception when insufficient_privilege then null;
  end;

  update public.payments set status = 'paid', paid_on = date '2026-11-19'
  where id = current_setting('test.payment_id')::uuid and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 1 or (select revision from public.payments where id = current_setting('test.payment_id')::uuid) <> 2 then
    raise exception 'Revision did not advance';
  end if;
  update public.payments set notes = 'stale' where id = current_setting('test.payment_id')::uuid and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Stale revision overwrote a payment'; end if;

  update public.payments set notes = 'hidden' where id = '00000000-0000-4000-8000-000000000032';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Editor changed an unassigned payment'; end if;

  delete from public.payments where id = current_setting('test.payment_id')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Editor deleted a payment'; end if;

  if exists (select from public.payment_audit) then raise exception 'Non-admin can read audit history'; end if;
  begin
    insert into public.payment_audit (payment_id, organization_id, department_id, action)
    values (gen_random_uuid(), '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', 'insert');
    raise exception 'Client wrote audit history';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Viewer: read-only.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
declare changed integer;
begin
  if (select count(*) from public.payments) <> 1 then raise exception 'Viewer cannot read assigned department'; end if;
  begin
    insert into public.payments (organization_id, department_id, detail, payment_type, amount, status)
    values ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', 'Viewer', 'invoice', 1, 'unpaid');
    raise exception 'Viewer inserted a payment';
  exception when insufficient_privilege then null;
  end;
  update public.payments set notes = 'viewer';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Viewer updated a payment'; end if;
end $$;

-- Manager: deletes within the department, with the stale revision guard.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
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

-- Organization admin: reads every department and the full audit history, but cannot alter it.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
do $$
declare changed integer;
begin
  if (select array_agg(detail) from public.payments) is distinct from array['Sales rent'] then
    raise exception 'Admin visibility is wrong';
  end if;
  if (select array_agg(action order by id) from public.payment_audit
      where payment_id = current_setting('test.payment_id')::uuid) is distinct from array['insert', 'update', 'delete']
    or (select old_data ->> 'amount' from public.payment_audit
      where payment_id = current_setting('test.payment_id')::uuid and action = 'delete') <> '1250.50'
    or (select actor_id from public.payment_audit
      where payment_id = current_setting('test.payment_id')::uuid and action = 'delete') <> '00000000-0000-4000-8000-000000000003'
  then raise exception 'Audit history is incomplete'; end if;
  begin
    delete from public.payment_audit;
    raise exception 'Admin deleted audit history';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Another organization's admin sees only its own records.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
do $$ begin
  if (select array_agg(detail) from public.payments) is distinct from array['Other org']
    or exists (select from public.payment_audit where organization_id = '00000000-0000-4000-8000-000000000011')
  then raise exception 'Cross-organization isolation failed'; end if;
end $$;

-- Suspended members lose write access.
reset role;
update public.organization_memberships set active = false where user_id = '00000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
do $$ begin
  if exists (select from public.payments) then raise exception 'Suspended member reads payments'; end if;
  begin
    insert into public.payments (organization_id, department_id, detail, payment_type, amount, status)
    values ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021', 'Suspended', 'invoice', 1, 'unpaid');
    raise exception 'Suspended member inserted a payment';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
