alter table public.payments
  add column payment_method text
    constraint payments_payment_method check (payment_method in ('check', 'cash', 'bank'));

create function private.require_payment_method()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.payment_method is null then
    raise exception using errcode = '23514', message = 'Payment method is required';
  end if;
  if tg_op = 'UPDATE' and old.payment_method is not null and new.payment_method is null then
    raise exception using errcode = '23514', message = 'Payment method is required';
  end if;
  return new;
end;
$$;

revoke all on function private.require_payment_method() from public, anon, authenticated;

create trigger require_payment_method
  before insert or update on public.payments
  for each row execute function private.require_payment_method();

grant insert (payment_method) on public.payments to authenticated;
grant update (payment_method) on public.payments to authenticated;
