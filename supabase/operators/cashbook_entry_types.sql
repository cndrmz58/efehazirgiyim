-- Run once in Supabase SQL Editor after the cashbook setup and before deploying
-- the matching frontend. This never changes existing cashbook records.
begin;

do $$
declare
  unsupported text;
begin
  select string_agg(distinct entry_type, ', ' order by entry_type)
    into unsupported
    from public.cashbook_entries
    where entry_type not in (
      'Avans', 'Diğer', 'Fazla Mesai', 'Gelen Para', 'Kasa (Devir)',
      'Maaş Ödemesi', 'Mutfak Masrafı', 'Yemek', 'Yol Ücreti'
    );
  if unsupported is not null then
    raise exception 'Cashbook has transaction types outside the approved list: %. Review and reclassify them before retrying; no records were changed.', unsupported;
  end if;

  alter table public.cashbook_entries
    drop constraint if exists cashbook_entries_entry_type_check;
  alter table public.cashbook_entries
    add constraint cashbook_entries_entry_type_check check (entry_type in (
      'Avans', 'Diğer', 'Fazla Mesai', 'Gelen Para', 'Kasa (Devir)',
      'Maaş Ödemesi', 'Mutfak Masrafı', 'Yemek', 'Yol Ücreti'
    ));
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261124160000', 'cashbook_entry_types')
  on conflict (version) do nothing;
notify pgrst, 'reload schema';
commit;
