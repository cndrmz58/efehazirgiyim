-- Run against a disposable, migrated Supabase database as its owner.
begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000004');
insert into public.organizations (id, name) values
  ('00000000-0000-4000-8000-000000000011', 'Test A'),
  ('00000000-0000-4000-8000-000000000012', 'Test B');
insert into public.organization_memberships (organization_id, user_id, role, active, payment_role) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'member', true, 'manager'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', 'member', true, 'manager'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000003', 'member', true, null),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000004', 'member', true, 'viewer');
insert into public.payment_creator_labels (organization_id, user_id, display_name) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Muhasebe'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', 'Erkan'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000004', 'Kesim');
insert into public.payment_historical_creator_labels (organization_id, through_created_at, display_name) values
  ('00000000-0000-4000-8000-000000000011', '2026-11-26 09:53:14.682+00', 'Muhasebe'),
  ('00000000-0000-4000-8000-000000000012', '2026-11-26 09:53:14.682+00', 'Other');

set local role anon;
do $$ begin
  if has_table_privilege(current_user, 'public.payment_creator_labels', 'select')
    or has_table_privilege(current_user, 'public.payment_historical_creator_labels', 'select')
  then raise exception 'Anonymous can read labels'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
declare created public.payments;
begin
  if (select count(*) from public.payment_creator_labels) <> 2
    or exists (select from public.payment_creator_labels where display_name = 'Kesim')
    or (select array_agg(display_name) from public.payment_historical_creator_labels) is distinct from array['Muhasebe']
  then raise exception 'Label scope is wrong'; end if;
  begin
    update public.payment_creator_labels set display_name = 'Spoofed';
    raise exception 'Client changed labels';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.payment_historical_creator_labels set display_name = 'Spoofed';
    raise exception 'Client changed historical labels';
  exception when insufficient_privilege then null;
  end;
  insert into public.payments (organization_id, detail, payment_type, payment_method, amount, status)
  values ('00000000-0000-4000-8000-000000000011', 'Test', 'invoice', 'bank', 5, 'unpaid')
  returning * into created;
  perform set_config('test.creator_payment', created.id::text, true);
  if created.created_by is distinct from auth.uid() then raise exception 'Wrong creator'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$ begin
  update public.payments set notes = 'Edited' where id = current_setting('test.creator_payment')::uuid;
  if (select created_by from public.payments where id = current_setting('test.creator_payment')::uuid)
    is distinct from '00000000-0000-4000-8000-000000000001'::uuid
  then raise exception 'Edit changed creator'; end if;
  begin
    update public.payments set created_by = auth.uid() where id = current_setting('test.creator_payment')::uuid;
    raise exception 'Client changed creator';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
do $$ begin
  if exists (select from public.payment_creator_labels) or exists (select from public.payment_historical_creator_labels)
  then raise exception 'Unassigned member reads labels'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
do $$ begin
  if (select array_agg(display_name) from public.payment_creator_labels) is distinct from array['Kesim']
    or (select array_agg(display_name) from public.payment_historical_creator_labels) is distinct from array['Other']
  then raise exception 'Viewer label scope is wrong'; end if;
end $$;

reset role;
update public.organization_memberships set active = false where user_id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$ begin
  if exists (select from public.payment_creator_labels) or exists (select from public.payment_historical_creator_labels)
  then raise exception 'Suspended member reads labels'; end if;
end $$;
rollback;
