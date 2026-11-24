-- Disposable migrated database only. Fixtures and all mutations are rolled back.
begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000005');
insert into public.organizations (id, name) values
  ('00000000-0000-4000-8000-000000000011', 'Cashbook A'),
  ('00000000-0000-4000-8000-000000000012', 'Cashbook B');
insert into public.organization_memberships (organization_id, user_id, role, active, payment_role, cashbook_role) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'member', true, null, 'accountant'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', 'member', true, 'manager', null),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000003', 'admin', true, null, null),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000004', 'member', true, null, 'accountant'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000005', 'member', false, null, null);

do $$ begin
  begin
    update public.organization_memberships set cashbook_role = 'accountant'
      where user_id = '00000000-0000-4000-8000-000000000002';
    raise exception 'Multiple accountants accepted';
  exception when unique_violation then null;
  end;
end $$;

set local role anon;
do $$ begin
  if has_table_privilege(current_user, 'public.cashbook_entries', 'SELECT')
    or has_table_privilege(current_user, 'public.cashbook_audit', 'SELECT')
  then raise exception 'Anonymous privileges exposed'; end if;
end $$;
reset role;
set local role service_role;
do $$ begin
  if has_table_privilege(current_user, 'public.cashbook_entries', 'SELECT')
    or has_table_privilege(current_user, 'public.cashbook_audit', 'SELECT')
  then raise exception 'Service role table privileges exposed'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
declare created public.cashbook_entries; changed integer; value numeric;
begin
  insert into public.cashbook_entries (organization_id, entry_on, description, entry_type, incoming, outgoing)
  values ('00000000-0000-4000-8000-000000000011', '2026-11-24', 'Receipt', 'Gelen Para', '999999999999.99', '0')
  returning * into created;
  perform set_config('test.cashbook_id', created.id::text, true);
  if created.revision <> 1 or created.created_by <> auth.uid()
    or created.updated_by <> auth.uid() or created.incoming <> 999999999999.99
  then raise exception 'Wrong server metadata or amount'; end if;
  foreach value in array array[-1, 0, 0.001, 1.000, 1000000000000, 'NaN'::numeric, 'Infinity'::numeric] loop
    begin
      insert into public.cashbook_entries (organization_id, entry_on, description, entry_type, incoming, outgoing)
      values (created.organization_id, '2026-11-24', 'Invalid amount', 'Avans', value, 0);
      raise exception 'Invalid amount accepted: %', value;
    exception when check_violation then null;
    end;
    begin
      insert into public.cashbook_entries (organization_id, entry_on, description, entry_type, incoming, outgoing)
      values (created.organization_id, '2026-11-24', 'Invalid outgoing', 'Avans', 0, value);
      raise exception 'Invalid outgoing accepted: %', value;
    exception when check_violation then null;
    end;
  end loop;
  begin
    insert into public.cashbook_entries (organization_id, entry_on, description, entry_type, incoming, outgoing)
    values (created.organization_id, '2026-11-24', 'Two directions', 'Avans', 1, 1);
    raise exception 'Two positive directions accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.cashbook_entries (organization_id, entry_on, description, entry_type, incoming, outgoing)
    values (created.organization_id, 'infinity', 'Invalid date', 'Avans', 1, 0);
    raise exception 'Infinite date accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.cashbook_entries (organization_id, entry_on, description, entry_type, incoming, outgoing)
    values (created.organization_id, '2026-11-24', E' \t\n', 'Avans', 1, 0);
    raise exception 'Blank description accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.cashbook_entries (organization_id, entry_on, description, entry_type, incoming, outgoing)
    values ('00000000-0000-4000-8000-000000000012', '2026-11-24', 'Foreign', 'Avans', 1, 0);
    raise exception 'Cross-organization insert succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.cashbook_entries (organization_id, entry_on, description, entry_type, incoming, outgoing)
    values (created.organization_id, '2026-11-24', 'Unlisted type', 'Nakit', 1, 0);
    raise exception 'Unlisted transaction type accepted';
  exception when check_violation then null;
  end;
  begin
    update public.cashbook_entries set organization_id = '00000000-0000-4000-8000-000000000012';
    raise exception 'Client changed scope';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.cashbook_entries set revision = 50;
    raise exception 'Client spoofed revision';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.organization_memberships set cashbook_role = 'accountant';
    raise exception 'Client changed membership';
  exception when insufficient_privilege then null;
  end;
  update public.cashbook_entries set incoming = 0, outgoing = '0.01'
    where id = created.id and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 1 or (select revision from public.cashbook_entries where id = created.id) <> 2
  then raise exception 'Revision did not advance'; end if;
  update public.cashbook_entries set description = 'stale' where id = created.id and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Stale update succeeded'; end if;
  delete from public.cashbook_entries where id = created.id and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Stale delete succeeded'; end if;
  if exists (select from public.cashbook_audit) then raise exception 'Non-admin reads audit'; end if;
end $$;

-- A payment manager and even an organization admin are cashbook readers only.
do $$
declare reader text; changed integer;
begin
  foreach reader in array array['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'] loop
    perform set_config('request.jwt.claim.sub', reader, true);
    if (select count(*) from public.cashbook_entries) <> 1 then raise exception 'Member cannot read'; end if;
    begin
      insert into public.cashbook_entries (organization_id, entry_on, description, entry_type, incoming, outgoing)
      values ('00000000-0000-4000-8000-000000000011', '2026-11-24', 'Reader', 'Avans', 1, 0);
      raise exception 'Reader inserted';
    exception when insufficient_privilege then null;
    end;
    update public.cashbook_entries set description = 'Reader';
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'Reader updated'; end if;
    delete from public.cashbook_entries;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'Reader deleted'; end if;
    begin
      delete from public.cashbook_audit;
      raise exception 'Client erased audit';
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

-- Foreign accountant and inactive member cannot see or mutate this organization's rows.
do $$
declare reader text; changed integer;
begin
  foreach reader in array array['00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005'] loop
    perform set_config('request.jwt.claim.sub', reader, true);
    if exists (select from public.cashbook_entries) then raise exception 'Unauthorized read'; end if;
    update public.cashbook_entries set description = 'Unauthorized';
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'Unauthorized update'; end if;
    delete from public.cashbook_entries;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'Unauthorized delete'; end if;
    begin
      insert into public.cashbook_entries (organization_id, entry_on, description, entry_type, incoming, outgoing)
      values ('00000000-0000-4000-8000-000000000011', '2026-11-24', 'Unauthorized', 'Avans', 1, 0);
      raise exception 'Unauthorized insert';
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
delete from public.cashbook_entries where id = current_setting('test.cashbook_id')::uuid and revision = 2;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
do $$ begin
  if exists (select from public.cashbook_entries)
    or (select array_agg(action order by id) from public.cashbook_audit
      where entry_id = current_setting('test.cashbook_id')::uuid) is distinct from array['insert', 'update', 'delete']
    or (select old_data->>'outgoing' from public.cashbook_audit where action = 'delete') <> '0.01'
    or exists (select from public.cashbook_audit where actor_id <> '00000000-0000-4000-8000-000000000001')
  then raise exception 'Audit trail incorrect'; end if;
end $$;
reset role;

-- Revocation takes effect on the next statement, independently of a cached browser role.
update public.organization_memberships set active = false where user_id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$ begin
  if private.has_cashbook_access('00000000-0000-4000-8000-000000000011', true)
  then raise exception 'Inactive accountant retained access'; end if;
end $$;
reset role;
rollback;
