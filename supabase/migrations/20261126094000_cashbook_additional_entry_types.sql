alter table public.cashbook_entries
  drop constraint if exists cashbook_entries_entry_type_check;

alter table public.cashbook_entries
  add constraint cashbook_entries_entry_type_check check (entry_type in (
    'Araç Giderleri', 'Avans', 'Diğer', 'Fazla Mesai', 'Gelen Para',
    'Kasa (Devir)', 'Maaş Ödemesi', 'Mutfak Masrafı', 'Yemek',
    'Yevmiyeci Ödemesi', 'Yol Ücreti'
  ));
