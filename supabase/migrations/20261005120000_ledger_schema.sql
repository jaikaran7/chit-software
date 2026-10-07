-- Digital group ledger.
-- Existing public tables (enquiries, admin_projects, quotations, invoices,
-- admin_reviews, _prisma_migrations) are intentionally left untouched.

create table public.ledger_owners (
  user_id uuid primary key references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index ledger_owners_single_row on public.ledger_owners ((true));

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners (user_id) on delete restrict,
  name text not null check (char_length(btrim(name)) > 0),
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.group_schemes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners (user_id) on delete restrict,
  group_id uuid not null,
  normal_installment numeric(14,2) not null check (normal_installment > 0),
  post_withdrawal_installment numeric(14,2) not null check (post_withdrawal_installment > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id),
  unique (id, owner_id),
  foreign key (group_id, owner_id) references public.groups (id, owner_id) on delete restrict
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners (user_id) on delete restrict,
  member_code text not null,
  name text not null check (char_length(btrim(name)) > 0),
  mobile text,
  address text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, member_code),
  unique (id, owner_id)
);

create table public.member_counters (
  owner_id uuid primary key references public.ledger_owners (user_id) on delete restrict,
  last_number integer not null default 0 check (last_number >= 0)
);

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners (user_id) on delete restrict,
  group_id uuid not null,
  member_id uuid not null,
  joining_date date not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  scheduled_withdrawal_month date,
  scheduled_payout_amount numeric(14,2) check (scheduled_payout_amount is null or scheduled_payout_amount >= 0),
  actual_withdrawal_month date,
  actual_payout_amount numeric(14,2) check (actual_payout_amount is null or actual_payout_amount >= 0),
  initial_amount numeric(14,2) not null default 0 check (initial_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, member_id),
  unique (id, owner_id),
  foreign key (group_id, owner_id) references public.groups (id, owner_id) on delete restrict,
  foreign key (member_id, owner_id) references public.members (id, owner_id) on delete restrict
);

create table public.payout_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners (user_id) on delete restrict,
  group_id uuid not null,
  month date not null,
  scheduled_payout_amount numeric(14,2) not null check (scheduled_payout_amount > 0),
  noted_normal_installment numeric(14,2),
  noted_post_withdrawal_installment numeric(14,2),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, month),
  unique (id, owner_id),
  foreign key (group_id, owner_id) references public.groups (id, owner_id) on delete restrict,
  check (month = date_trunc('month', month)::date)
);

create table public.schedule_import_mappings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners (user_id) on delete restrict,
  group_id uuid not null,
  month_column text,
  payout_column text,
  normal_installment_column text,
  post_withdrawal_column text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id),
  foreign key (group_id, owner_id) references public.groups (id, owner_id) on delete restrict
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners (user_id) on delete restrict,
  group_membership_id uuid not null,
  payment_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'gpay', 'qr', 'bank_transfer', 'other')),
  reference_number text,
  notes text,
  allocate_through date,
  status text not null default 'posted' check (status in ('posted', 'voided')),
  void_reason text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (group_membership_id, owner_id) references public.group_memberships (id, owner_id) on delete restrict,
  check (status <> 'voided' or (void_reason is not null and char_length(btrim(void_reason)) > 0))
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners (user_id) on delete restrict,
  payment_transaction_id uuid not null,
  group_membership_id uuid not null,
  allocation_kind text not null check (allocation_kind in ('monthly', 'joining')),
  due_month date,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  created_at timestamptz not null default now(),
  foreign key (payment_transaction_id, owner_id) references public.payment_transactions (id, owner_id) on delete restrict,
  foreign key (group_membership_id, owner_id) references public.group_memberships (id, owner_id) on delete restrict,
  check (
    (allocation_kind = 'monthly' and due_month is not null and due_month = date_trunc('month', due_month)::date)
    or (allocation_kind = 'joining' and due_month is null)
  )
);

create table public.withdrawal_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners (user_id) on delete restrict,
  group_membership_id uuid not null,
  scheduled_month date,
  scheduled_amount numeric(14,2) check (scheduled_amount is null or scheduled_amount >= 0),
  actual_withdrawal_month date not null,
  actual_amount numeric(14,2) not null check (actual_amount > 0),
  payment_date date not null,
  payment_method text not null check (payment_method in ('cash', 'gpay', 'qr', 'bank_transfer', 'other')),
  status text not null default 'paid' check (status in ('paid', 'voided')),
  adjustment_reason text,
  notes text,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (group_membership_id, owner_id) references public.group_memberships (id, owner_id) on delete restrict,
  check (actual_withdrawal_month = date_trunc('month', actual_withdrawal_month)::date),
  check (scheduled_month is null or scheduled_month = date_trunc('month', scheduled_month)::date),
  check (
    scheduled_amount is null
    or actual_amount = scheduled_amount
    or (adjustment_reason is not null and char_length(btrim(adjustment_reason)) > 0)
  ),
  check (status <> 'voided' or (void_reason is not null and char_length(btrim(void_reason)) > 0))
);

-- One paid withdrawal per membership. Many memberships may share the same month.
create unique index withdrawal_one_paid_per_membership
  on public.withdrawal_transactions (group_membership_id)
  where status = 'paid';

create index withdrawal_actual_month_idx
  on public.withdrawal_transactions (actual_withdrawal_month);

create table public.receipt_counters (
  owner_id uuid not null references public.ledger_owners (user_id) on delete restrict,
  receipt_type text not null check (receipt_type in ('COLLECTION', 'PAYOUT')),
  year integer not null check (year >= 2000),
  last_number integer not null default 0 check (last_number >= 0),
  primary key (owner_id, receipt_type, year)
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners (user_id) on delete restrict,
  receipt_number text not null unique,
  receipt_type text not null check (receipt_type in ('COLLECTION', 'PAYOUT')),
  payment_transaction_id uuid,
  withdrawal_transaction_id uuid,
  created_at timestamptz not null default now(),
  check (
    (receipt_type = 'COLLECTION' and payment_transaction_id is not null and withdrawal_transaction_id is null)
    or (receipt_type = 'PAYOUT' and withdrawal_transaction_id is not null and payment_transaction_id is null)
  ),
  foreign key (payment_transaction_id, owner_id) references public.payment_transactions (id, owner_id) on delete restrict,
  foreign key (withdrawal_transaction_id, owner_id) references public.withdrawal_transactions (id, owner_id) on delete restrict
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners (user_id) on delete restrict,
  record_type text not null,
  record_id uuid not null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index groups_owner_idx on public.groups (owner_id);
create index members_owner_name_idx on public.members (owner_id, name);
create index memberships_group_idx on public.group_memberships (group_id);
create index memberships_member_idx on public.group_memberships (member_id);
create index payments_membership_idx on public.payment_transactions (group_membership_id, payment_date);
create index allocations_membership_month_idx on public.payment_allocations (group_membership_id, due_month);
create index allocations_payment_idx on public.payment_allocations (payment_transaction_id);
create index schedules_group_month_idx on public.payout_schedules (group_id, month);
create index receipts_owner_idx on public.receipts (owner_id, created_at desc);
create index audit_record_idx on public.audit_logs (record_type, record_id);

create or replace function public.ledger_month(p_date date)
returns date
language sql
immutable
as $$
  select date_trunc('month', p_date::timestamp)::date
$$;

create or replace function public.ledger_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger groups_updated before update on public.groups
  for each row execute function public.ledger_set_updated_at();
create trigger schemes_updated before update on public.group_schemes
  for each row execute function public.ledger_set_updated_at();
create trigger members_updated before update on public.members
  for each row execute function public.ledger_set_updated_at();
create trigger memberships_updated before update on public.group_memberships
  for each row execute function public.ledger_set_updated_at();
create trigger schedules_updated before update on public.payout_schedules
  for each row execute function public.ledger_set_updated_at();
create trigger mappings_updated before update on public.schedule_import_mappings
  for each row execute function public.ledger_set_updated_at();
create trigger withdrawals_updated before update on public.withdrawal_transactions
  for each row execute function public.ledger_set_updated_at();

create or replace function public.ledger_block_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Records cannot be deleted. Archive the row or post a reversal.';
end;
$$;

create trigger groups_no_delete before delete on public.groups
  for each row execute function public.ledger_block_delete();
create trigger schemes_no_delete before delete on public.group_schemes
  for each row execute function public.ledger_block_delete();
create trigger members_no_delete before delete on public.members
  for each row execute function public.ledger_block_delete();
create trigger memberships_no_delete before delete on public.group_memberships
  for each row execute function public.ledger_block_delete();
create trigger schedules_no_delete before delete on public.payout_schedules
  for each row execute function public.ledger_block_delete();
create trigger payments_no_delete before delete on public.payment_transactions
  for each row execute function public.ledger_block_delete();
create trigger allocations_no_delete before delete on public.payment_allocations
  for each row execute function public.ledger_block_delete();
create trigger withdrawals_no_delete before delete on public.withdrawal_transactions
  for each row execute function public.ledger_block_delete();
create trigger receipts_no_delete before delete on public.receipts
  for each row execute function public.ledger_block_delete();
create trigger audit_no_delete before delete on public.audit_logs
  for each row execute function public.ledger_block_delete();

create or replace function public.ledger_normalize_membership_months()
returns trigger
language plpgsql
as $$
begin
  if new.scheduled_withdrawal_month is not null then
    new.scheduled_withdrawal_month := public.ledger_month(new.scheduled_withdrawal_month);
  end if;
  if new.actual_withdrawal_month is not null then
    new.actual_withdrawal_month := public.ledger_month(new.actual_withdrawal_month);
  end if;
  return new;
end;
$$;

create trigger memberships_normalize_months
  before insert or update on public.group_memberships
  for each row execute function public.ledger_normalize_membership_months();

create or replace function public.ledger_normalize_withdrawal_months()
returns trigger
language plpgsql
as $$
begin
  new.actual_withdrawal_month := public.ledger_month(new.actual_withdrawal_month);
  if new.scheduled_month is not null then
    new.scheduled_month := public.ledger_month(new.scheduled_month);
  end if;
  return new;
end;
$$;

create trigger withdrawals_normalize_months
  before insert or update on public.withdrawal_transactions
  for each row execute function public.ledger_normalize_withdrawal_months();

create or replace function public.ledger_guard_allocation_total()
returns trigger
language plpgsql
as $$
declare
  v_paid numeric(14,2);
  v_allocated numeric(14,2);
begin
  select amount into v_paid
  from public.payment_transactions
  where id = new.payment_transaction_id;

  select coalesce(sum(allocated_amount), 0) into v_allocated
  from public.payment_allocations
  where payment_transaction_id = new.payment_transaction_id;

  if v_allocated > v_paid then
    raise exception 'Allocations cannot exceed the payment amount';
  end if;
  return new;
end;
$$;

create trigger allocations_guard_total
  after insert on public.payment_allocations
  for each row execute function public.ledger_guard_allocation_total();
