-- Ledger business rules. Amounts always come from stored scheme and schedule rows.

create or replace function public.assert_ledger_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.ledger_owners where user_id = uid) then
    raise exception 'Not the ledger owner';
  end if;
  return uid;
end;
$$;

create or replace function public.claim_ledger_owner()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  select user_id into existing from public.ledger_owners limit 1;
  if existing is null then
    insert into public.ledger_owners (user_id) values (uid);
    return uid;
  elsif existing = uid then
    return uid;
  else
    raise exception 'This ledger already has an owner';
  end if;
end;
$$;

create or replace function public.ledger_write_audit(
  p_owner uuid,
  p_type text,
  p_id uuid,
  p_action text,
  p_old jsonb,
  p_new jsonb,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (owner_id, record_type, record_id, action, old_value, new_value, reason)
  values (
    p_owner,
    p_type,
    p_id,
    p_action,
    p_old,
    p_new,
    nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$$;

create or replace function public.calculate_member_monthly_due(p_membership_id uuid, p_month date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_month date := public.ledger_month(p_month);
  v_owner uuid;
  v_join date;
  v_normal numeric(14,2);
  v_post numeric(14,2);
  v_actual date;
begin
  select gm.owner_id, public.ledger_month(gm.joining_date), gs.normal_installment, gs.post_withdrawal_installment
    into v_owner, v_join, v_normal, v_post
  from public.group_memberships gm
  join public.group_schemes gs on gs.group_id = gm.group_id
  where gm.id = p_membership_id;

  if v_owner is null or v_owner <> uid then
    raise exception 'Membership not found';
  end if;
  if v_normal is null then
    raise exception 'This group has no scheme';
  end if;
  if v_month < v_join then
    return 0;
  end if;

  select public.ledger_month(w.actual_withdrawal_month)
    into v_actual
  from public.withdrawal_transactions w
  where w.group_membership_id = p_membership_id
    and w.status = 'paid'
  limit 1;

  -- The withdrawal month itself still uses the normal installment.
  if v_actual is null or v_month <= v_actual then
    return v_normal;
  end if;
  return v_post;
end;
$$;

create or replace function public.calculate_post_withdrawal_installment(p_membership_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_owner uuid;
  v_post numeric(14,2);
begin
  select gm.owner_id, gs.post_withdrawal_installment
    into v_owner, v_post
  from public.group_memberships gm
  join public.group_schemes gs on gs.group_id = gm.group_id
  where gm.id = p_membership_id;

  if v_owner is null or v_owner <> uid then
    raise exception 'Membership not found';
  end if;
  return v_post;
end;
$$;

create or replace function public.membership_positions(p_membership_id uuid, p_through date)
returns table (
  month date,
  due numeric,
  allocated numeric,
  paid numeric,
  outstanding numeric,
  advance_credit numeric,
  status text,
  joining_due numeric,
  joining_outstanding numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_owner uuid;
  v_start date;
  v_through date := public.ledger_month(p_through);
  v_initial numeric(14,2);
  v_collected numeric(14,2);
  v_allocated_all numeric(14,2);
  v_pool numeric(14,2);
  v_join_paid numeric(14,2);
  v_join_gap numeric(14,2);
  v_join_out numeric(14,2);
  v_due numeric(14,2);
  v_alloc numeric(14,2);
  v_gap numeric(14,2);
  v_use numeric(14,2);
  v_paid numeric(14,2);
  v_out numeric(14,2);
  v_month date;
  v_status text;
  v_months date[];
begin
  select gm.owner_id, public.ledger_month(gm.joining_date), gm.initial_amount
    into v_owner, v_start, v_initial
  from public.group_memberships gm
  where gm.id = p_membership_id;

  if v_owner is null or v_owner <> uid then
    raise exception 'Membership not found';
  end if;

  select coalesce(sum(pt.amount), 0)
    into v_collected
  from public.payment_transactions pt
  where pt.group_membership_id = p_membership_id
    and pt.status = 'posted';

  select coalesce(sum(pa.allocated_amount), 0)
    into v_allocated_all
  from public.payment_allocations pa
  join public.payment_transactions pt on pt.id = pa.payment_transaction_id
  where pa.group_membership_id = p_membership_id
    and pt.status = 'posted';

  v_pool := greatest(v_collected - v_allocated_all, 0);

  select coalesce(sum(pa.allocated_amount), 0)
    into v_join_paid
  from public.payment_allocations pa
  join public.payment_transactions pt on pt.id = pa.payment_transaction_id
  where pa.group_membership_id = p_membership_id
    and pa.allocation_kind = 'joining'
    and pt.status = 'posted';

  v_join_gap := greatest(coalesce(v_initial, 0) - v_join_paid, 0);
  v_use := least(v_join_gap, v_pool);
  v_pool := v_pool - v_use;
  v_join_out := v_join_gap - v_use;

  if v_start > v_through then
    v_months := array[v_through];
  else
    select coalesce(array_agg(gs::date order by gs), array[v_through])
      into v_months
    from generate_series(v_start::timestamp, v_through::timestamp, interval '1 month') gs;
  end if;

  foreach v_month in array v_months loop
    if v_month < v_start then
      v_due := 0;
    else
      v_due := public.calculate_member_monthly_due(p_membership_id, v_month);
    end if;

    select coalesce(sum(pa.allocated_amount), 0)
      into v_alloc
    from public.payment_allocations pa
    join public.payment_transactions pt on pt.id = pa.payment_transaction_id
    where pa.group_membership_id = p_membership_id
      and pa.allocation_kind = 'monthly'
      and pa.due_month = v_month
      and pt.status = 'posted';

    v_gap := greatest(v_due - v_alloc, 0);
    v_use := least(v_gap, v_pool);
    v_pool := v_pool - v_use;
    v_paid := least(v_alloc, v_due) + v_use;
    v_out := v_gap - v_use;

    if v_out > 0 and v_paid = 0 then
      v_status := 'NOT_PAID';
    elsif v_out > 0 then
      v_status := 'PARTIAL';
    elsif v_due = 0 and v_pool > 0 then
      v_status := 'ADVANCE';
    elsif v_due = 0 then
      v_status := 'NOT_DUE';
    elsif v_pool > 0 and v_month = v_through then
      v_status := 'ADVANCE';
    else
      v_status := 'PAID';
    end if;

    month := v_month;
    due := v_due;
    allocated := v_alloc;
    paid := v_paid;
    outstanding := v_out;
    advance_credit := v_pool;
    status := v_status;
    joining_due := coalesce(v_initial, 0);
    joining_outstanding := v_join_out;
    return next;
  end loop;
end;
$$;

create or replace function public.calculate_outstanding_balance(p_membership_id uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select mp.outstanding
    from public.membership_positions(p_membership_id, p_month) mp
    where mp.month = public.ledger_month(p_month)
  ), 0)
$$;

create or replace function public.calculate_advance_credit(p_membership_id uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select mp.advance_credit
    from public.membership_positions(p_membership_id, p_month) mp
    where mp.month = public.ledger_month(p_month)
  ), 0)
$$;

create or replace function public.calculate_member_payment_status(p_membership_id uuid, p_month date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select mp.status
    from public.membership_positions(p_membership_id, p_month) mp
    where mp.month = public.ledger_month(p_month)
  ), 'NOT_DUE')
$$;

create or replace function public.get_member_statement(p_membership_id uuid, p_through date)
returns table (
  month date,
  due numeric,
  paid numeric,
  outstanding numeric,
  advance_credit numeric,
  status text,
  joining_due numeric,
  joining_outstanding numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select mp.month, mp.due, mp.paid, mp.outstanding, mp.advance_credit, mp.status, mp.joining_due, mp.joining_outstanding
  from public.membership_positions(p_membership_id, p_through) mp
$$;

create or replace function public.get_collection_sheet(p_group_id uuid, p_month date)
returns table (
  membership_id uuid,
  member_id uuid,
  member_name text,
  member_code text,
  mobile text,
  due numeric,
  paid numeric,
  outstanding numeric,
  advance_credit numeric,
  status text,
  joining_outstanding numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
begin
  if not exists (select 1 from public.groups g where g.id = p_group_id and g.owner_id = uid) then
    raise exception 'Group not found';
  end if;

  return query
  select
    gm.id,
    m.id,
    m.name,
    m.member_code,
    m.mobile,
    coalesce(p.due, 0)::numeric,
    coalesce(p.paid, 0)::numeric,
    coalesce(p.outstanding, 0)::numeric,
    coalesce(p.advance_credit, 0)::numeric,
    coalesce(p.status, 'NOT_DUE'),
    coalesce(p.joining_outstanding, gm.initial_amount)::numeric
  from public.group_memberships gm
  join public.members m on m.id = gm.member_id
  left join lateral (
    select mp.due, mp.paid, mp.outstanding, mp.advance_credit, mp.status, mp.joining_outstanding
    from public.membership_positions(gm.id, p_month) mp
    where mp.month = public.ledger_month(p_month)
  ) p on true
  where gm.group_id = p_group_id
    and gm.owner_id = uid
    and gm.status = 'active'
  order by m.name;
end;
$$;

create or replace function public.get_group_dashboard(p_group_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_month date := public.ledger_month(p_month);
  v_name text;
  v_normal numeric(14,2);
  v_post numeric(14,2);
  v_expected numeric(14,2);
  v_collected numeric(14,2);
  v_pending numeric(14,2);
  v_advance numeric(14,2);
  v_joining numeric(14,2);
  v_partial integer;
  v_members integer;
  v_sched numeric(14,2);
  v_actual_total numeric(14,2);
  v_actual_count integer;
begin
  select g.name, gs.normal_installment, gs.post_withdrawal_installment
    into v_name, v_normal, v_post
  from public.groups g
  left join public.group_schemes gs on gs.group_id = g.id
  where g.id = p_group_id and g.owner_id = uid;

  if v_name is null then
    raise exception 'Group not found';
  end if;

  select
    coalesce(sum(s.due), 0),
    coalesce(sum(s.paid), 0),
    coalesce(sum(s.outstanding), 0),
    coalesce(sum(s.advance_credit), 0),
    coalesce(sum(s.joining_outstanding), 0),
    count(*) filter (where s.status = 'PARTIAL'),
    count(*)
  into v_expected, v_collected, v_pending, v_advance, v_joining, v_partial, v_members
  from public.get_collection_sheet(p_group_id, v_month) s;

  select ps.scheduled_payout_amount
    into v_sched
  from public.payout_schedules ps
  where ps.group_id = p_group_id and ps.month = v_month;

  select coalesce(sum(w.actual_amount), 0), count(*)
    into v_actual_total, v_actual_count
  from public.withdrawal_transactions w
  join public.group_memberships gm on gm.id = w.group_membership_id
  where gm.group_id = p_group_id
    and w.status = 'paid'
    and w.actual_withdrawal_month = v_month;

  return jsonb_build_object(
    'group_id', p_group_id,
    'group_name', v_name,
    'month', v_month,
    'member_count', v_members,
    'normal_installment', v_normal,
    'post_withdrawal_installment', v_post,
    'expected_collection', v_expected,
    'collected', v_collected,
    'pending', v_pending,
    'partial_count', v_partial,
    'advance', v_advance,
    'joining_outstanding', v_joining,
    'scheduled_payout', v_sched,
    'actual_payout_total', v_actual_total,
    'actual_withdrawal_count', v_actual_count
  );
end;
$$;

create or replace function public.calculate_group_expected_collection(p_group_id uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select (public.get_group_dashboard(p_group_id, p_month)->>'expected_collection')::numeric
$$;

create or replace function public.calculate_group_collected_amount(p_group_id uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select (public.get_group_dashboard(p_group_id, p_month)->>'collected')::numeric
$$;

create or replace function public.calculate_group_pending_amount(p_group_id uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select (public.get_group_dashboard(p_group_id, p_month)->>'pending')::numeric
$$;

create or replace function public.calculate_group_payout_amount(p_group_id uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select (public.get_group_dashboard(p_group_id, p_month)->>'actual_payout_total')::numeric
$$;

create or replace function public.get_actual_withdrawal_status(p_membership_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_owner uuid;
  v_sched_month date;
  v_sched_amt numeric(14,2);
  v_actual_month date;
  v_actual_amt numeric(14,2);
  v_id uuid;
  v_status text;
begin
  select gm.owner_id, gm.scheduled_withdrawal_month, gm.scheduled_payout_amount
    into v_owner, v_sched_month, v_sched_amt
  from public.group_memberships gm
  where gm.id = p_membership_id;

  if v_owner is null or v_owner <> uid then
    raise exception 'Membership not found';
  end if;

  select w.id, w.actual_withdrawal_month, w.actual_amount
    into v_id, v_actual_month, v_actual_amt
  from public.withdrawal_transactions w
  where w.group_membership_id = p_membership_id
    and w.status = 'paid'
  limit 1;

  if v_id is not null then
    v_status := 'withdrawn';
  elsif v_sched_month is not null then
    v_status := 'scheduled';
  else
    v_status := 'none';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'scheduled_month', v_sched_month,
    'scheduled_amount', v_sched_amt,
    'actual_month', v_actual_month,
    'actual_amount', v_actual_amt,
    'withdrawal_id', v_id
  );
end;
$$;

create or replace function public.membership_scheduled_snapshot(p_membership_id uuid)
returns table (scheduled_month date, scheduled_amount numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_owner uuid;
  v_group uuid;
  v_month date;
  v_amount numeric(14,2);
begin
  select gm.owner_id, gm.group_id, gm.scheduled_withdrawal_month, gm.scheduled_payout_amount
    into v_owner, v_group, v_month, v_amount
  from public.group_memberships gm
  where gm.id = p_membership_id;

  if v_owner is null or v_owner <> uid then
    raise exception 'Membership not found';
  end if;

  if v_amount is null and v_month is not null then
    select ps.scheduled_payout_amount into v_amount
    from public.payout_schedules ps
    where ps.group_id = v_group and ps.month = v_month;
  end if;

  scheduled_month := v_month;
  scheduled_amount := v_amount;
  return next;
end;
$$;

create or replace function public.get_payout_sheet(p_group_id uuid, p_month date)
returns table (
  membership_id uuid,
  member_id uuid,
  member_name text,
  member_code text,
  scheduled_month date,
  scheduled_amount numeric,
  actual_month date,
  actual_amount numeric,
  withdrawal_id uuid,
  withdrawal_status text,
  payment_method text,
  payment_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_month date := public.ledger_month(p_month);
begin
  if not exists (select 1 from public.groups g where g.id = p_group_id and g.owner_id = uid) then
    raise exception 'Group not found';
  end if;

  return query
  select
    gm.id,
    m.id,
    m.name,
    m.member_code,
    snap.scheduled_month,
    snap.scheduled_amount,
    w.actual_withdrawal_month,
    w.actual_amount,
    w.id,
    coalesce(w.status, 'none'),
    w.payment_method,
    w.payment_date
  from public.group_memberships gm
  join public.members m on m.id = gm.member_id
  left join lateral public.membership_scheduled_snapshot(gm.id) snap on true
  left join public.withdrawal_transactions w
    on w.group_membership_id = gm.id and w.status = 'paid'
  where gm.group_id = p_group_id
    and gm.owner_id = uid
    and (gm.status = 'active' or w.actual_withdrawal_month = v_month)
  order by m.name;
end;
$$;
