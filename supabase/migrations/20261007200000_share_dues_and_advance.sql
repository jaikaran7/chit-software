-- A member who holds several shares owes that many installments each month.
-- A payment recorded for a month that has not opened yet is kept on that month
-- as an advance, and earlier months still show the amount as already paid ahead.

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
  v_notes text;
  v_shares numeric(14,2) := 1;
begin
  select gm.owner_id, public.ledger_month(gm.joining_date), gs.normal_installment, gs.post_withdrawal_installment, gm.notes
    into v_owner, v_join, v_normal, v_post, v_notes
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

  if v_notes is not null and left(btrim(v_notes), 1) = '{' then
    begin
      v_shares := greatest(round(coalesce((v_notes::jsonb ->> 'shares')::numeric, 1), 0), 1);
    exception
      when others then
        v_shares := 1;
    end;
  end if;

  select public.ledger_month(w.actual_withdrawal_month)
    into v_actual
  from public.withdrawal_transactions w
  where w.group_membership_id = p_membership_id
    and w.status = 'paid'
  limit 1;

  -- The withdrawal month itself still uses the normal installment.
  if v_actual is null or v_month <= v_actual then
    return round(v_normal * v_shares, 2);
  end if;
  return round(v_post * v_shares, 2);
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
  v_later numeric(14,2);
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

    select coalesce(sum(pa.allocated_amount), 0)
      into v_later
    from public.payment_allocations pa
    join public.payment_transactions pt on pt.id = pa.payment_transaction_id
    where pa.group_membership_id = p_membership_id
      and pa.allocation_kind = 'monthly'
      and pa.due_month > v_month
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
    elsif v_due = 0 and (v_pool > 0 or v_later > 0) then
      v_status := 'ADVANCE';
    elsif v_due = 0 then
      v_status := 'NOT_DUE';
    elsif (v_pool > 0 or v_later > 0) and v_month = v_through then
      v_status := 'ADVANCE';
    else
      v_status := 'PAID';
    end if;

    month := v_month;
    due := v_due;
    allocated := v_alloc;
    paid := v_paid;
    outstanding := v_out;
    advance_credit := v_pool + v_later;
    status := v_status;
    joining_due := coalesce(v_initial, 0);
    joining_outstanding := v_join_out;
    return next;
  end loop;
end;
$$;

create or replace function public.record_collection(
  p_membership_id uuid,
  p_month date,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_owner uuid;
  v_payment uuid;
  v_receipt uuid;
  v_number text;
  v_amount numeric(14,2) := round(p_amount, 2);
  v_alloc jsonb;
  v_pos jsonb;
  v_month date := public.ledger_month(p_month);
  v_due numeric(14,2);
  v_already numeric(14,2);
begin
  select owner_id into v_owner from public.group_memberships where id = p_membership_id for update;
  if v_owner is null or v_owner <> uid then
    raise exception 'Membership not found';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter the amount received';
  end if;
  if p_payment_date is null or p_month is null then
    raise exception 'Choose the payment date and the month';
  end if;
  if p_method not in ('cash', 'gpay', 'qr', 'bank_transfer', 'other') then
    raise exception 'Choose a payment method';
  end if;

  insert into public.payment_transactions (
    owner_id, group_membership_id, payment_date, amount, payment_method, reference_number, notes, allocate_through, status
  ) values (
    uid, p_membership_id, p_payment_date, v_amount, p_method,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_month,
    'posted'
  )
  returning id into v_payment;

  -- A month that has not opened yet keeps the payment on that month.
  -- Earlier months stay open, and they show the amount as advance already paid.
  if v_month > public.ledger_month(current_date) then
    v_due := public.calculate_member_monthly_due(p_membership_id, v_month);
    select coalesce(sum(pa.allocated_amount), 0)
      into v_already
    from public.payment_allocations pa
    join public.payment_transactions pt on pt.id = pa.payment_transaction_id
    where pa.group_membership_id = p_membership_id
      and pa.allocation_kind = 'monthly'
      and pa.due_month = v_month
      and pt.status = 'posted';
    perform public.ledger_take_payment(p_membership_id, uid, 'monthly', v_month, greatest(v_due - coalesce(v_already, 0), 0));
  else
    perform public.allocate_unallocated(p_membership_id, v_month);
  end if;

  v_number := public.next_receipt_number(uid, 'COLLECTION', extract(year from p_payment_date)::integer);
  insert into public.receipts (owner_id, receipt_number, receipt_type, payment_transaction_id)
  values (uid, v_number, 'COLLECTION', v_payment)
  returning id into v_receipt;

  select coalesce(jsonb_agg(jsonb_build_object(
    'allocation_kind', pa.allocation_kind,
    'due_month', pa.due_month,
    'allocated_amount', pa.allocated_amount
  ) order by pa.due_month nulls first), '[]'::jsonb)
    into v_alloc
  from public.payment_allocations pa
  where pa.payment_transaction_id = v_payment;

  select to_jsonb(mp) into v_pos
  from public.membership_positions(p_membership_id, v_month) mp
  where mp.month = v_month;

  perform public.ledger_write_audit(uid, 'payment_transactions', v_payment, 'create', null,
    jsonb_build_object('amount', v_amount, 'method', p_method, 'allocations', v_alloc, 'receipt_number', v_number),
    null);

  return jsonb_build_object(
    'receipt_id', v_receipt,
    'receipt_number', v_number,
    'payment_id', v_payment,
    'allocations', v_alloc,
    'position', v_pos
  );
end;
$$;

-- Members added before the chit start was moved earlier still had a later joining date,
-- so the opening month had no due and could not be recorded.
update public.group_memberships gm
set joining_date = public.ledger_month((g.description::jsonb ->> 'start')::date)
from public.groups g
where gm.group_id = g.id
  and coalesce(g.description, '') like '{%'
  and (g.description::jsonb ->> 'v') = '1'
  and (g.description::jsonb ->> 'start') ~ '^\d{4}-\d{2}-\d{2}'
  and gm.joining_date > public.ledger_month((g.description::jsonb ->> 'start')::date)
  and not exists (
    select 1
    from public.payment_allocations pa
    join public.payment_transactions pt on pt.id = pa.payment_transaction_id
    where pa.group_membership_id = gm.id
      and pt.status = 'posted'
      and pa.allocation_kind = 'monthly'
  );
