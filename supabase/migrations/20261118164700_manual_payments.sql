create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  department_id uuid not null,
  detail text not null check (detail ~ '[^[:space:]]' and char_length(detail) <= 200),
  payment_type text not null check (payment_type in ('tax', 'credit', 'invoice', 'salary', 'insurance', 'rent', 'other')),
  amount numeric not null,
  currency text not null default 'TRY' check (currency in ('TRY', 'EUR', 'USD')),
  due_on date check (isfinite(due_on)),
  paid_on date check (isfinite(paid_on)),
  notes text check (char_length(notes) <= 2000),
  status text not null check (status in ('paid', 'unpaid')),
  created_at timestamptz not null default now(),
  foreign key (organization_id, department_id) references public.departments (organization_id, id),
  -- A numeric typmod would silently round fractional digits before the check.
  constraint payments_amount check (amount > 0 and amount < 1000000000000 and scale(amount) <= 2),
  constraint payments_paid_date check ((status = 'paid') = (paid_on is not null))
);

create index on public.payments (organization_id, department_id);

alter table public.payments enable row level security;
revoke all on public.payments from public, anon, authenticated, service_role;
