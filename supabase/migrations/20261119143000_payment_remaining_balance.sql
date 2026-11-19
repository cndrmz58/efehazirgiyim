begin;

alter table public.payments
  add column remaining_amount numeric;

update public.payments
set remaining_amount = case when status = 'paid' then 0 else amount end;

alter table public.payments
  alter column remaining_amount set not null,
  drop constraint payments_status_check,
  drop constraint payments_paid_date,
  add constraint payments_status check (status in ('paid', 'unpaid', 'partially_paid')),
  add constraint payments_remaining_amount
    check (remaining_amount >= 0 and remaining_amount <= amount and scale(remaining_amount) <= 2),
  add constraint payments_status_balance check (
    (status = 'paid' and remaining_amount = 0 and paid_on is not null)
    or (status = 'unpaid' and paid_on is null)
    or (status = 'partially_paid' and remaining_amount > 0 and remaining_amount < amount)
  );

create function private.sync_payment_remaining_status()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.remaining_amount is null then
    new.remaining_amount := case when new.status = 'paid' then 0 else new.amount end;
  end if;
  if new.remaining_amount > 0 and new.remaining_amount < new.amount then
    new.status := 'partially_paid';
  end if;
  return new;
end;
$$;

revoke all on function private.sync_payment_remaining_status() from public, anon, authenticated;

create trigger sync_payment_remaining_status
  before insert or update of amount, remaining_amount on public.payments
  for each row execute function private.sync_payment_remaining_status();

grant insert (remaining_amount) on public.payments to authenticated;
grant update (remaining_amount) on public.payments to authenticated;

commit;
