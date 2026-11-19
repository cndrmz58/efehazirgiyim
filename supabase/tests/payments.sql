-- Run against a disposable, migrated Supabase database as its owner.
begin;

insert into public.organizations (id, name) values
  ('00000000-0000-4000-8000-000000000011', 'Test A'),
  ('00000000-0000-4000-8000-000000000012', 'Test B');

insert into public.departments (id, organization_id, name) values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000011', 'Finance'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000012', 'Finance');

do $$
declare
  org constant uuid := '00000000-0000-4000-8000-000000000011';
  dept constant uuid := '00000000-0000-4000-8000-000000000021';
  other_dept constant uuid := '00000000-0000-4000-8000-000000000022';
  bounded_amount numeric;
  actual_remaining numeric;
  default_currency text;
  payment_status text;
  invalid_amount numeric;
begin
  insert into public.payments (organization_id, department_id, detail, payment_type, payment_method, amount, status, due_on)
  values (org, dept, 'Unpaid invoice', 'invoice', 'bank', 999999999999.99, 'unpaid', date '2026-12-01')
  returning amount, remaining_amount, currency into bounded_amount, actual_remaining, default_currency;
  if bounded_amount is distinct from 999999999999.99
    or actual_remaining is distinct from bounded_amount
    or default_currency is distinct from 'TRY' then
    raise exception 'Maximum amount, default remaining balance, or default currency changed';
  end if;

  insert into public.payments (organization_id, department_id, detail, payment_type, payment_method, amount, currency, status, paid_on)
  values (org, dept, 'Paid rent', 'rent', 'check', 0.01, 'EUR', 'paid', date '2026-11-18');

  insert into public.payments (organization_id, department_id, detail, payment_type, payment_method, amount, remaining_amount, status)
  values (org, dept, 'Partial invoice', 'invoice', 'bank', 100, 20, 'unpaid')
  returning status, remaining_amount into payment_status, actual_remaining;
  if payment_status is distinct from 'partially_paid' or actual_remaining is distinct from 20 then
    raise exception 'A positive partial balance did not select partially_paid';
  end if;

  insert into public.payments (organization_id, department_id, detail, payment_type, payment_method, amount, remaining_amount, status)
  values (org, dept, 'Zero balance unpaid', 'invoice', 'bank', 100, 0, 'unpaid')
  returning status, remaining_amount into payment_status, actual_remaining;
  if payment_status is distinct from 'unpaid' or actual_remaining is distinct from 0 then
    raise exception 'A zero balance changed the manually selected status';
  end if;

  foreach invalid_amount in array array[0, -0.01, 1.001, 1000000000000, 'NaN'::numeric] loop
    begin
      insert into public.payments (organization_id, department_id, detail, payment_type, payment_method, amount, status)
      values (org, dept, 'Invalid amount', 'invoice', 'cash', invalid_amount, 'unpaid');
      raise exception 'Invalid amount accepted: %', invalid_amount;
    exception when check_violation then null;
    end;
  end loop;

  foreach invalid_amount in array array[-0.01, 100.01, 1.001] loop
    begin
      insert into public.payments (organization_id, department_id, detail, payment_type, payment_method, amount, remaining_amount, status)
      values (org, dept, 'Invalid remaining amount', 'invoice', 'bank', 100, invalid_amount, 'unpaid');
      raise exception 'Invalid remaining amount accepted: %', invalid_amount;
    exception when check_violation then null;
    end;
  end loop;

  begin
    insert into public.payments (organization_id, department_id, detail, payment_type, payment_method, amount, remaining_amount, status)
    values (org, dept, 'Invalid partial status', 'invoice', 'bank', 100, 0, 'partially_paid');
    raise exception 'Zero remaining balance accepted as partially paid';
  exception when check_violation then null;
  end;

  begin
    insert into public.payments (organization_id, department_id, detail, payment_type, payment_method, amount, status, due_on)
    values (org, dept, 'Missing actual date', 'invoice', 'bank', 1, 'paid', date '2026-12-01');
    raise exception 'Due date unexpectedly replaced the actual date';
  exception when check_violation then null;
  end;
  begin
    insert into public.payments (organization_id, department_id, detail, payment_type, payment_method, amount, status, paid_on)
    values (org, dept, 'Unexpected actual date', 'invoice', 'bank', 1, 'unpaid', date '2026-11-18');
    raise exception 'Unpaid payment accepted an actual date';
  exception when check_violation then null;
  end;
  begin
    insert into public.payments (organization_id, department_id, detail, payment_type, payment_method, amount, status)
    values (org, other_dept, 'Cross-organization reference', 'invoice', 'bank', 1, 'unpaid');
    raise exception 'Cross-organization department accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.payments (organization_id, department_id, detail, payment_type, payment_method, amount, status)
    values (org, dept, 'Invalid payment method', 'invoice', 'transfer', 1, 'unpaid');
    raise exception 'Invalid payment method accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.payments (organization_id, department_id, detail, payment_type, amount, status)
    values (org, dept, 'Missing payment method', 'invoice', 1, 'unpaid');
    raise exception 'Missing payment method accepted';
  exception when check_violation then null;
  end;
end $$;

do $$
declare
  api_role text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.payments'::regclass) then
    raise exception 'Payments RLS is not enabled';
  end if;

  -- Authenticated access is granted and tested in payment_access.sql.
  foreach api_role in array array['anon', 'service_role'] loop
    if has_table_privilege(api_role, 'public.payments', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      or has_any_column_privilege(api_role, 'public.payments', 'SELECT, INSERT, UPDATE, REFERENCES') then
      raise exception 'Unexpected payments privileges for %', api_role;
    end if;
  end loop;
end $$;

rollback;
