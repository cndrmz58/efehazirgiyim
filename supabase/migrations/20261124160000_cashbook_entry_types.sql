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
end $$;

alter table public.cashbook_entries
  drop constraint if exists cashbook_entries_entry_type_check;

alter table public.cashbook_entries
  add constraint cashbook_entries_entry_type_check check (entry_type in (
    'Avans', 'Diğer', 'Fazla Mesai', 'Gelen Para', 'Kasa (Devir)',
    'Maaş Ödemesi', 'Mutfak Masrafı', 'Yemek', 'Yol Ücreti'
  ));
