create or replace function public.ledger_take_payment(
  p_membership_id uuid,
  p_owner uuid,
  p_kind text,
  p_month date,
  p_gap numeric
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gap numeric(14,2) := p_gap;
  v_payment uuid;
  v_left numeric(14,2);
  v_take numeric(14,2);
begin
  if v_gap is null or v_gap <= 0 then
    return 0;
  end if;

  while v_gap > 0 loop
    v_payment := null;
    v_left := null;
    select pt.id,
           pt.amount - coalesce((
             select sum(pa.allocated_amount)
             from public.payment_allocations pa
             where pa.payment_transaction_id = pt.id
           ), 0)
      into v_payment, v_left
    from public.payment_transactions pt
    where pt.group_membership_id = p_membership_id
      and pt.owner_id = p_owner
      and pt.status = 'posted'
      and pt.amount > coalesce((
        select sum(pa.allocated_amount)
        from public.payment_allocations pa
        where pa.payment_transaction_id = pt.id
      ), 0)
    order by pt.payment_date, pt.created_at
    limit 1;

    exit when v_payment is null or v_left is null or v_left <= 0;

    v_take := least(v_gap, v_left);
    insert into public.payment_allocations (
      owner_id, payment_transaction_id, group_membership_id, allocation_kind, due_month, allocated_amount
    ) values (
      p_owner,
      v_payment,
      p_membership_id,
      p_kind,
      case when p_kind = 'monthly' then p_month else null end,
      v_take
    );
    v_gap := v_gap - v_take;
  end loop;

  return v_gap;
end;
$$;

create or replace function public.allocate_unallocated(p_membership_id uuid, p_through date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_owner uuid;
  v_start date;
  v_through date := public.ledger_month(p_through);
  v_initial numeric(14,2);
  v_join_paid numeric(14,2);
  v_gap numeric(14,2);
  v_month date;
  v_due numeric(14,2);
  v_alloc numeric(14,2);
begin
  select gm.owner_id, public.ledger_month(gm.joining_date), gm.initial_amount
    into v_owner, v_start, v_initial
  from public.group_memberships gm
  where gm.id = p_membership_id
  for update;

  if v_owner is null or v_owner <> uid then
    raise exception 'Membership not found';
  end if;

  perform 1
  from public.payment_transactions pt
  where pt.group_membership_id = p_membership_id
  for update;

  select coalesce(sum(pa.allocated_amount), 0)
    into v_join_paid
  from public.payment_allocations pa
  join public.payment_transactions pt on pt.id = pa.payment_transaction_id
  where pa.group_membership_id = p_membership_id
    and pa.allocation_kind = 'joining'
    and pt.status = 'posted';

  v_gap := greatest(coalesce(v_initial, 0) - v_join_paid, 0);
  perform public.ledger_take_payment(p_membership_id, uid, 'joining', null, v_gap);

  if v_start <= v_through then
    for v_month in
      select gs::date
      from generate_series(v_start::timestamp, v_through::timestamp, interval '1 month') gs
    loop
      v_due := public.calculate_member_monthly_due(p_membership_id, v_month);
      select coalesce(sum(pa.allocated_amount), 0)
        into v_alloc
      from public.payment_allocations pa
      join public.payment_transactions pt on pt.id = pa.payment_transaction_id
      where pa.group_membership_id = p_membership_id
        and pa.allocation_kind = 'monthly'
        and pa.due_month = v_month
        and pt.status = 'posted';
      v_gap := greatest(v_due - v_alloc, 0);
      perform public.ledger_take_payment(p_membership_id, uid, 'monthly', v_month, v_gap);
    end loop;
  end if;
end;
$$;

create or replace function public.allocate_payment(p_membership_id uuid, p_through date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.allocate_unallocated(p_membership_id, p_through);
end;
$$;

create or replace function public.next_receipt_number(p_owner uuid, p_type text, p_year integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  prefix text;
begin
  insert into public.receipt_counters as c (owner_id, receipt_type, year, last_number)
  values (p_owner, p_type, p_year, 1)
  on conflict (owner_id, receipt_type, year)
  do update set last_number = c.last_number + 1
  returning last_number into n;

  prefix := case when p_type = 'COLLECTION' then 'REC' else 'PAY' end;
  return prefix || '-' || p_year::text || '-' || lpad(n::text, 6, '0');
end;
$$;

create or replace function public.create_group_with_scheme(
  p_name text,
  p_description text,
  p_normal numeric,
  p_post numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  gid uuid;
begin
  if p_normal is null or p_normal <= 0 or p_post is null or p_post <= 0 then
    raise exception 'Enter the normal installment and the post-withdrawal installment';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Enter a group name';
  end if;

  insert into public.groups (owner_id, name, description)
  values (uid, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''))
  returning id into gid;

  insert into public.group_schemes (owner_id, group_id, normal_installment, post_withdrawal_installment)
  values (uid, gid, round(p_normal, 2), round(p_post, 2));

  perform public.ledger_write_audit(uid, 'groups', gid, 'create', null,
    jsonb_build_object('name', btrim(p_name), 'normal_installment', round(p_normal, 2), 'post_withdrawal_installment', round(p_post, 2)),
    null);
  return gid;
end;
$$;

create or replace function public.update_group(
  p_group_id uuid,
  p_name text,
  p_description text,
  p_status text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_old public.groups%rowtype;
begin
  select * into v_old from public.groups where id = p_group_id and owner_id = uid;
  if v_old.id is null then
    raise exception 'Group not found';
  end if;
  if p_status not in ('active', 'archived') then
    raise exception 'Invalid group status';
  end if;

  update public.groups
  set name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      status = p_status
  where id = p_group_id and owner_id = uid;

  perform public.ledger_write_audit(uid, 'groups', p_group_id, 'update', to_jsonb(v_old),
    jsonb_build_object('name', btrim(p_name), 'description', p_description, 'status', p_status), null);
end;
$$;

create or replace function public.update_scheme(
  p_group_id uuid,
  p_normal numeric,
  p_post numeric,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_old public.group_schemes%rowtype;
  v_normal numeric(14,2) := round(p_normal, 2);
  v_post numeric(14,2) := round(p_post, 2);
begin
  select * into v_old from public.group_schemes where group_id = p_group_id and owner_id = uid;
  if v_old.id is null then
    raise exception 'Scheme not found';
  end if;
  if v_normal <= 0 or v_post <= 0 then
    raise exception 'Installments must be greater than zero';
  end if;
  if v_old.normal_installment is distinct from v_normal or v_old.post_withdrawal_installment is distinct from v_post then
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'A reason is required to change installment amounts';
    end if;
  end if;

  update public.group_schemes
  set normal_installment = v_normal,
      post_withdrawal_installment = v_post
  where id = v_old.id;

  perform public.ledger_write_audit(uid, 'group_schemes', v_old.id, 'update', to_jsonb(v_old),
    jsonb_build_object('normal_installment', v_normal, 'post_withdrawal_installment', v_post), p_reason);
end;
$$;

create or replace function public.create_member(
  p_name text,
  p_mobile text,
  p_address text,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  n integer;
  code text;
  mid uuid;
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Enter the member name';
  end if;

  insert into public.member_counters as c (owner_id, last_number)
  values (uid, 1)
  on conflict (owner_id) do update set last_number = c.last_number + 1
  returning last_number into n;

  code := 'M-' || lpad(n::text, 6, '0');

  insert into public.members (owner_id, member_code, name, mobile, address, notes)
  values (
    uid,
    code,
    btrim(p_name),
    nullif(btrim(coalesce(p_mobile, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into mid;

  perform public.ledger_write_audit(uid, 'members', mid, 'create', null,
    jsonb_build_object('member_code', code, 'name', btrim(p_name)), null);
  return mid;
end;
$$;

create or replace function public.update_member(
  p_member_id uuid,
  p_name text,
  p_mobile text,
  p_address text,
  p_notes text,
  p_status text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_old public.members%rowtype;
begin
  select * into v_old from public.members where id = p_member_id and owner_id = uid;
  if v_old.id is null then
    raise exception 'Member not found';
  end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'Invalid member status';
  end if;
  if v_old.status is distinct from p_status and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to change member status';
  end if;

  update public.members
  set name = btrim(p_name),
      mobile = nullif(btrim(coalesce(p_mobile, '')), ''),
      address = nullif(btrim(coalesce(p_address, '')), ''),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      status = p_status
  where id = p_member_id and owner_id = uid;

  perform public.ledger_write_audit(uid, 'members', p_member_id, 'update', to_jsonb(v_old),
    jsonb_build_object('name', btrim(p_name), 'status', p_status), p_reason);
end;
$$;

create or replace function public.add_group_membership(
  p_group_id uuid,
  p_member_id uuid,
  p_joining_date date,
  p_initial_amount numeric,
  p_notes text,
  p_scheduled_month date,
  p_scheduled_amount numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  mid uuid;
  v_amount numeric(14,2);
begin
  if not exists (select 1 from public.groups where id = p_group_id and owner_id = uid) then
    raise exception 'Group not found';
  end if;
  if not exists (select 1 from public.members where id = p_member_id and owner_id = uid) then
    raise exception 'Member not found';
  end if;
  if not exists (select 1 from public.group_schemes where group_id = p_group_id) then
    raise exception 'Add a scheme before adding members';
  end if;
  if p_joining_date is null then
    raise exception 'Enter the joining date';
  end if;
  if coalesce(p_initial_amount, 0) < 0 then
    raise exception 'Catch-up amount cannot be negative';
  end if;

  v_amount := case when p_scheduled_amount is null then null else round(p_scheduled_amount, 2) end;
  if p_scheduled_month is not null and v_amount is null then
    select ps.scheduled_payout_amount into v_amount
    from public.payout_schedules ps
    where ps.group_id = p_group_id and ps.month = public.ledger_month(p_scheduled_month);
  end if;

  begin
    insert into public.group_memberships (
      owner_id, group_id, member_id, joining_date, initial_amount, notes,
      scheduled_withdrawal_month, scheduled_payout_amount
    ) values (
      uid, p_group_id, p_member_id, p_joining_date, round(coalesce(p_initial_amount, 0), 2),
      nullif(btrim(coalesce(p_notes, '')), ''),
      case when p_scheduled_month is null then null else public.ledger_month(p_scheduled_month) end,
      v_amount
    )
    returning id into mid;
  exception when unique_violation then
    raise exception 'This person is already in that group';
  end;

  perform public.ledger_write_audit(uid, 'group_memberships', mid, 'create', null,
    jsonb_build_object(
      'group_id', p_group_id,
      'member_id', p_member_id,
      'joining_date', p_joining_date,
      'initial_amount', round(coalesce(p_initial_amount, 0), 2)
    ), null);
  return mid;
end;
$$;

create or replace function public.update_group_membership(
  p_membership_id uuid,
  p_status text,
  p_joining_date date,
  p_initial_amount numeric,
  p_notes text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_old public.group_memberships%rowtype;
  v_initial numeric(14,2) := round(coalesce(p_initial_amount, 0), 2);
  v_join_paid numeric(14,2);
begin
  select * into v_old from public.group_memberships where id = p_membership_id and owner_id = uid;
  if v_old.id is null then
    raise exception 'Membership not found';
  end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'Invalid membership status';
  end if;
  if v_initial < 0 then
    raise exception 'Catch-up amount cannot be negative';
  end if;

  select coalesce(sum(pa.allocated_amount), 0) into v_join_paid
  from public.payment_allocations pa
  join public.payment_transactions pt on pt.id = pa.payment_transaction_id
  where pa.group_membership_id = p_membership_id
    and pa.allocation_kind = 'joining'
    and pt.status = 'posted';

  if v_initial < v_join_paid then
    raise exception 'Catch-up amount cannot be less than what is already paid toward it';
  end if;

  if public.ledger_month(p_joining_date) > public.ledger_month(v_old.joining_date) and exists (
    select 1
    from public.payment_allocations pa
    join public.payment_transactions pt on pt.id = pa.payment_transaction_id
    where pa.group_membership_id = p_membership_id
      and pa.allocation_kind = 'monthly'
      and pt.status = 'posted'
      and pa.due_month < public.ledger_month(p_joining_date)
  ) then
    raise exception 'This member already has payments before the new joining month';
  end if;

  if (v_old.status is distinct from p_status
      or v_old.joining_date is distinct from p_joining_date
      or v_old.initial_amount is distinct from v_initial)
     and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to change membership, joining date, or catch-up amount';
  end if;

  update public.group_memberships
  set status = p_status,
      joining_date = p_joining_date,
      initial_amount = v_initial,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_membership_id and owner_id = uid;

  perform public.ledger_write_audit(uid, 'group_memberships', p_membership_id, 'update', to_jsonb(v_old),
    jsonb_build_object('status', p_status, 'joining_date', p_joining_date, 'initial_amount', v_initial, 'notes', p_notes),
    p_reason);
end;
$$;

create or replace function public.assign_scheduled_withdrawal(
  p_membership_id uuid,
  p_month date,
  p_amount numeric,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_old public.group_memberships%rowtype;
  v_month date;
  v_amount numeric(14,2);
begin
  select * into v_old from public.group_memberships where id = p_membership_id and owner_id = uid for update;
  if v_old.id is null then
    raise exception 'Membership not found';
  end if;

  v_month := case when p_month is null then null else public.ledger_month(p_month) end;
  if p_amount is null then
    if v_month is not null then
      select ps.scheduled_payout_amount into v_amount
      from public.payout_schedules ps
      where ps.group_id = v_old.group_id and ps.month = v_month;
    end if;
  else
    v_amount := round(p_amount, 2);
    if v_amount < 0 then
      raise exception 'Scheduled payout cannot be negative';
    end if;
  end if;

  if (v_old.scheduled_withdrawal_month is distinct from v_month
      or v_old.scheduled_payout_amount is distinct from v_amount)
     and (v_old.scheduled_withdrawal_month is not null or v_old.scheduled_payout_amount is not null)
     and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to change the scheduled withdrawal';
  end if;

  update public.group_memberships
  set scheduled_withdrawal_month = v_month,
      scheduled_payout_amount = v_amount
  where id = p_membership_id;

  perform public.ledger_write_audit(uid, 'group_memberships', p_membership_id, 'schedule_change',
    jsonb_build_object('scheduled_withdrawal_month', v_old.scheduled_withdrawal_month, 'scheduled_payout_amount', v_old.scheduled_payout_amount),
    jsonb_build_object('scheduled_withdrawal_month', v_month, 'scheduled_amount', v_amount),
    p_reason);
end;
$$;

create or replace function public.save_import_mapping(
  p_group_id uuid,
  p_month_column text,
  p_payout_column text,
  p_normal_column text,
  p_post_column text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
begin
  if not exists (select 1 from public.groups where id = p_group_id and owner_id = uid) then
    raise exception 'Group not found';
  end if;

  insert into public.schedule_import_mappings (
    owner_id, group_id, month_column, payout_column, normal_installment_column, post_withdrawal_column
  ) values (
    uid, p_group_id,
    nullif(btrim(coalesce(p_month_column, '')), ''),
    nullif(btrim(coalesce(p_payout_column, '')), ''),
    nullif(btrim(coalesce(p_normal_column, '')), ''),
    nullif(btrim(coalesce(p_post_column, '')), '')
  )
  on conflict (group_id) do update set
    month_column = excluded.month_column,
    payout_column = excluded.payout_column,
    normal_installment_column = excluded.normal_installment_column,
    post_withdrawal_column = excluded.post_withdrawal_column,
    updated_at = now();
end;
$$;

create or replace function public.import_payout_schedules(
  p_group_id uuid,
  p_rows jsonb,
  p_mode text,
  p_apply_scheme boolean,
  p_source text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  elem jsonb;
  v_month date;
  v_amount numeric(14,2);
  v_normal numeric(14,2);
  v_post numeric(14,2);
  v_conflicts text;
  v_normal_count integer;
  v_post_count integer;
  v_scheme_normal numeric(14,2);
  v_scheme_post numeric(14,2);
  v_old public.group_schemes%rowtype;
  v_existing public.payout_schedules%rowtype;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_id uuid;
begin
  if not exists (select 1 from public.groups where id = p_group_id and owner_id = uid) then
    raise exception 'Group not found';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Paste at least one schedule row';
  end if;
  if p_mode not in ('commit', 'replace', 'skip') then
    raise exception 'Choose replace, skip, or commit';
  end if;

  create temporary table if not exists _ledger_import_rows (
    month date primary key,
    amount numeric(14,2) not null,
    noted_normal numeric(14,2),
    noted_post numeric(14,2)
  ) on commit drop;
  truncate _ledger_import_rows;

  for elem in select value from jsonb_array_elements(p_rows) loop
    begin
      v_month := public.ledger_month((elem->>'month')::date);
    exception when others then
      raise exception 'Invalid month: %', coalesce(elem->>'month', '(blank)');
    end;
    begin
      v_amount := round((elem->>'scheduled_payout_amount')::numeric, 2);
    exception when others then
      raise exception 'Invalid payout amount for %', to_char(v_month, 'Mon YYYY');
    end;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Missing payout amount for %', to_char(v_month, 'Mon YYYY');
    end if;

    v_normal := null;
    v_post := null;
    if nullif(elem->>'noted_normal_installment', '') is not null then
      begin
        v_normal := round((elem->>'noted_normal_installment')::numeric, 2);
      exception when others then
        raise exception 'Invalid normal installment for %', to_char(v_month, 'Mon YYYY');
      end;
    end if;
    if nullif(elem->>'noted_post_withdrawal_installment', '') is not null then
      begin
        v_post := round((elem->>'noted_post_withdrawal_installment')::numeric, 2);
      exception when others then
        raise exception 'Invalid post-withdrawal installment for %', to_char(v_month, 'Mon YYYY');
      end;
    end if;

    begin
      insert into _ledger_import_rows (month, amount, noted_normal, noted_post)
      values (v_month, v_amount, v_normal, v_post);
    exception when unique_violation then
      raise exception 'The pasted table repeats %', to_char(v_month, 'Mon YYYY');
    end;
  end loop;

  select string_agg(to_char(i.month, 'YYYY-MM'), ',' order by i.month)
    into v_conflicts
  from _ledger_import_rows i
  join public.payout_schedules ps on ps.group_id = p_group_id and ps.month = i.month;

  if v_conflicts is not null and p_mode not in ('replace', 'skip') then
    raise exception 'DUPLICATE_MONTHS:%', v_conflicts;
  end if;

  if coalesce(p_apply_scheme, false) then
    select count(distinct noted_normal) into v_normal_count from _ledger_import_rows where noted_normal is not null;
    select count(distinct noted_post) into v_post_count from _ledger_import_rows where noted_post is not null;
    if v_normal_count = 0 and v_post_count = 0 then
      raise exception 'No installment columns to apply to the scheme';
    end if;
    if v_normal_count > 1 then
      raise exception 'Normal installment is not the same on every row';
    end if;
    if v_post_count > 1 then
      raise exception 'Post-withdrawal installment is not the same on every row';
    end if;

    select * into v_old from public.group_schemes where group_id = p_group_id and owner_id = uid;
    if v_old.id is null then
      raise exception 'This group has no scheme';
    end if;
    select min(noted_normal) into v_scheme_normal from _ledger_import_rows;
    select min(noted_post) into v_scheme_post from _ledger_import_rows;
    v_scheme_normal := coalesce(v_scheme_normal, v_old.normal_installment);
    v_scheme_post := coalesce(v_scheme_post, v_old.post_withdrawal_installment);
    if v_scheme_normal <= 0 or v_scheme_post <= 0 then
      raise exception 'Installment amounts must be greater than zero';
    end if;

    if v_old.normal_installment is distinct from v_scheme_normal
       or v_old.post_withdrawal_installment is distinct from v_scheme_post then
      update public.group_schemes
      set normal_installment = v_scheme_normal,
          post_withdrawal_installment = v_scheme_post
      where id = v_old.id;
      perform public.ledger_write_audit(uid, 'group_schemes', v_old.id, 'update', to_jsonb(v_old),
        jsonb_build_object('normal_installment', v_scheme_normal, 'post_withdrawal_installment', v_scheme_post),
        'Schedule import');
    end if;
  end if;

  for v_month, v_amount, v_normal, v_post in
    select month, amount, noted_normal, noted_post from _ledger_import_rows order by month
  loop
    select * into v_existing from public.payout_schedules where group_id = p_group_id and month = v_month;
    if v_existing.id is not null and p_mode = 'skip' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if v_existing.id is not null and p_mode = 'replace' then
      update public.payout_schedules
      set scheduled_payout_amount = v_amount,
          noted_normal_installment = v_normal,
          noted_post_withdrawal_installment = v_post,
          source = left(coalesce(p_source, 'import'), 200)
      where id = v_existing.id;
      perform public.ledger_write_audit(uid, 'payout_schedules', v_existing.id, 'update', to_jsonb(v_existing),
        jsonb_build_object('month', v_month, 'scheduled_payout_amount', v_amount), 'Schedule import replace');
      v_updated := v_updated + 1;
    else
      insert into public.payout_schedules (
        owner_id, group_id, month, scheduled_payout_amount,
        noted_normal_installment, noted_post_withdrawal_installment, source
      ) values (
        uid, p_group_id, v_month, v_amount, v_normal, v_post, left(coalesce(p_source, 'import'), 200)
      )
      returning id into v_id;
      perform public.ledger_write_audit(uid, 'payout_schedules', v_id, 'create', null,
        jsonb_build_object('month', v_month, 'scheduled_payout_amount', v_amount), 'Schedule import');
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped);
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
    public.ledger_month(p_month),
    'posted'
  )
  returning id into v_payment;

  perform public.allocate_unallocated(p_membership_id, p_month);

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
  from public.membership_positions(p_membership_id, p_month) mp
  where mp.month = public.ledger_month(p_month);

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

create or replace function public.void_collection(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_old public.payment_transactions%rowtype;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to reverse a collection';
  end if;
  select * into v_old from public.payment_transactions where id = p_payment_id and owner_id = uid for update;
  if v_old.id is null then
    raise exception 'Payment not found';
  end if;
  if v_old.status <> 'posted' then
    raise exception 'This collection is already reversed';
  end if;

  update public.payment_transactions
  set status = 'voided', void_reason = btrim(p_reason), voided_at = now()
  where id = p_payment_id;

  perform public.ledger_write_audit(uid, 'payment_transactions', p_payment_id, 'void', to_jsonb(v_old),
    jsonb_build_object('status', 'voided'), p_reason);
end;
$$;

create or replace function public.record_payout(
  p_membership_id uuid,
  p_actual_month date,
  p_actual_amount numeric,
  p_payment_date date,
  p_method text,
  p_adjustment_reason text,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_owner uuid;
  v_sched_month date;
  v_sched_amt numeric(14,2);
  v_actual numeric(14,2) := round(p_actual_amount, 2);
  v_month date := public.ledger_month(p_actual_month);
  v_id uuid;
  v_receipt uuid;
  v_number text;
  v_reason text := nullif(btrim(coalesce(p_adjustment_reason, '')), '');
begin
  select owner_id into v_owner from public.group_memberships where id = p_membership_id for update;
  if v_owner is null or v_owner <> uid then
    raise exception 'Membership not found';
  end if;
  if exists (
    select 1 from public.withdrawal_transactions
    where group_membership_id = p_membership_id and status = 'paid'
  ) then
    raise exception 'This member already has a payout in this group. Correct that payout instead of adding another.';
  end if;
  if v_actual is null or v_actual <= 0 then
    raise exception 'Enter the actual payout amount';
  end if;
  if p_payment_date is null or p_actual_month is null then
    raise exception 'Choose the payout date and the actual month';
  end if;
  if p_method not in ('cash', 'gpay', 'qr', 'bank_transfer', 'other') then
    raise exception 'Choose a payment method';
  end if;

  select snap.scheduled_month, snap.scheduled_amount
    into v_sched_month, v_sched_amt
  from public.membership_scheduled_snapshot(p_membership_id) snap;

  if v_sched_amt is not null and v_sched_amt <> v_actual and v_reason is null then
    raise exception 'A reason is required when the actual payout differs from the scheduled payout';
  end if;

  insert into public.withdrawal_transactions (
    owner_id, group_membership_id, scheduled_month, scheduled_amount,
    actual_withdrawal_month, actual_amount, payment_date, payment_method,
    status, adjustment_reason, notes
  ) values (
    uid, p_membership_id, v_sched_month, v_sched_amt,
    v_month, v_actual, p_payment_date, p_method,
    'paid', v_reason, nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_id;

  v_number := public.next_receipt_number(uid, 'PAYOUT', extract(year from p_payment_date)::integer);
  insert into public.receipts (owner_id, receipt_number, receipt_type, withdrawal_transaction_id)
  values (uid, v_number, 'PAYOUT', v_id)
  returning id into v_receipt;

  perform public.ledger_write_audit(uid, 'withdrawal_transactions', v_id, 'create', null,
    jsonb_build_object(
      'scheduled_month', v_sched_month,
      'scheduled_amount', v_sched_amt,
      'actual_withdrawal_month', v_month,
      'actual_amount', v_actual,
      'receipt_number', v_number
    ), v_reason);

  return jsonb_build_object(
    'receipt_id', v_receipt,
    'receipt_number', v_number,
    'withdrawal_id', v_id,
    'scheduled_month', v_sched_month,
    'scheduled_amount', v_sched_amt,
    'actual_month', v_month,
    'actual_amount', v_actual
  );
end;
$$;

create or replace function public.update_actual_withdrawal(
  p_withdrawal_id uuid,
  p_actual_month date,
  p_actual_amount numeric,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_old public.withdrawal_transactions%rowtype;
  v_amount numeric(14,2) := round(p_actual_amount, 2);
  v_month date := public.ledger_month(p_actual_month);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then
    raise exception 'A reason is required to change a payout';
  end if;
  select * into v_old from public.withdrawal_transactions where id = p_withdrawal_id and owner_id = uid for update;
  if v_old.id is null then
    raise exception 'Payout not found';
  end if;
  if v_old.status <> 'paid' then
    raise exception 'This payout is already reversed';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter the actual payout amount';
  end if;

  update public.withdrawal_transactions
  set actual_withdrawal_month = v_month,
      actual_amount = v_amount,
      adjustment_reason = case
        when v_old.scheduled_amount is not null and v_old.scheduled_amount <> v_amount then v_reason
        else v_old.adjustment_reason
      end,
      notes = concat_ws(E'\n', v_old.notes, 'Correction: ' || v_reason)
  where id = p_withdrawal_id;

  perform public.ledger_write_audit(uid, 'withdrawal_transactions', p_withdrawal_id, 'update', to_jsonb(v_old),
    jsonb_build_object('actual_withdrawal_month', v_month, 'actual_amount', v_amount), v_reason);
end;
$$;

create or replace function public.void_payout(p_withdrawal_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_old public.withdrawal_transactions%rowtype;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to reverse a payout';
  end if;
  select * into v_old from public.withdrawal_transactions where id = p_withdrawal_id and owner_id = uid for update;
  if v_old.id is null then
    raise exception 'Payout not found';
  end if;
  if v_old.status <> 'paid' then
    raise exception 'This payout is already reversed';
  end if;

  update public.withdrawal_transactions
  set status = 'voided', void_reason = btrim(p_reason)
  where id = p_withdrawal_id;

  perform public.ledger_write_audit(uid, 'withdrawal_transactions', p_withdrawal_id, 'void', to_jsonb(v_old),
    jsonb_build_object('status', 'voided'), p_reason);
end;
$$;

create or replace function public.get_receipt(p_receipt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_receipt public.receipts%rowtype;
  v_result jsonb;
begin
  select * into v_receipt from public.receipts where id = p_receipt_id and owner_id = uid;
  if v_receipt.id is null then
    raise exception 'Receipt not found';
  end if;

  if v_receipt.receipt_type = 'COLLECTION' then
    select jsonb_build_object(
      'id', v_receipt.id,
      'receipt_number', v_receipt.receipt_number,
      'receipt_type', v_receipt.receipt_type,
      'created_at', v_receipt.created_at,
      'group_name', g.name,
      'member_name', m.name,
      'member_code', m.member_code,
      'payment_date', pt.payment_date,
      'amount', pt.amount,
      'payment_method', pt.payment_method,
      'reference_number', pt.reference_number,
      'notes', pt.notes,
      'status', pt.status,
      'void_reason', pt.void_reason,
      'payment_id', pt.id,
      'allocations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'allocation_kind', pa.allocation_kind,
          'due_month', pa.due_month,
          'allocated_amount', pa.allocated_amount
        ) order by pa.due_month nulls first)
        from public.payment_allocations pa
        where pa.payment_transaction_id = pt.id
      ), '[]'::jsonb)
    ) into v_result
    from public.payment_transactions pt
    join public.group_memberships gm on gm.id = pt.group_membership_id
    join public.members m on m.id = gm.member_id
    join public.groups g on g.id = gm.group_id
    where pt.id = v_receipt.payment_transaction_id;
  else
    select jsonb_build_object(
      'id', v_receipt.id,
      'receipt_number', v_receipt.receipt_number,
      'receipt_type', v_receipt.receipt_type,
      'created_at', v_receipt.created_at,
      'group_name', g.name,
      'member_name', m.name,
      'member_code', m.member_code,
      'payment_date', w.payment_date,
      'payment_method', w.payment_method,
      'scheduled_month', w.scheduled_month,
      'scheduled_amount', w.scheduled_amount,
      'actual_month', w.actual_withdrawal_month,
      'actual_amount', w.actual_amount,
      'adjustment_reason', w.adjustment_reason,
      'notes', w.notes,
      'status', w.status,
      'void_reason', w.void_reason,
      'withdrawal_id', w.id
    ) into v_result
    from public.withdrawal_transactions w
    join public.group_memberships gm on gm.id = w.group_membership_id
    join public.members m on m.id = gm.member_id
    join public.groups g on g.id = gm.group_id
    where w.id = v_receipt.withdrawal_transaction_id;
  end if;

  return v_result;
end;
$$;

create or replace function public.list_recent_activity(p_limit integer default 40)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 200);
begin
  return (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.happened_on desc, x.receipt_number desc), '[]'::jsonb)
    from (
      select
        r.receipt_type as kind,
        r.id as receipt_id,
        r.receipt_number,
        pt.payment_date as happened_on,
        pt.amount,
        pt.payment_method,
        pt.status,
        m.name as member_name,
        g.name as group_name,
        null::date as scheduled_month,
        null::numeric as scheduled_amount,
        pt.allocate_through as actual_month
      from public.receipts r
      join public.payment_transactions pt on pt.id = r.payment_transaction_id
      join public.group_memberships gm on gm.id = pt.group_membership_id
      join public.members m on m.id = gm.member_id
      join public.groups g on g.id = gm.group_id
      where r.owner_id = uid
      union all
      select
        r.receipt_type,
        r.id,
        r.receipt_number,
        w.payment_date,
        w.actual_amount,
        w.payment_method,
        w.status,
        m.name,
        g.name,
        w.scheduled_month,
        w.scheduled_amount,
        w.actual_withdrawal_month
      from public.receipts r
      join public.withdrawal_transactions w on w.id = r.withdrawal_transaction_id
      join public.group_memberships gm on gm.id = w.group_membership_id
      join public.members m on m.id = gm.member_id
      join public.groups g on g.id = gm.group_id
      where r.owner_id = uid
      order by happened_on desc, receipt_number desc
      limit v_limit
    ) x
  );
end;
$$;

create or replace function public.get_group_report(p_group_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.assert_ledger_owner();
  v_month date := public.ledger_month(p_month);
  v_next date := (v_month + interval '1 month')::date;
  v_dashboard jsonb;
  v_members jsonb;
  v_payouts jsonb;
  v_methods jsonb;
  v_payout_methods jsonb;
begin
  if not exists (select 1 from public.groups g where g.id = p_group_id and g.owner_id = uid) then
    raise exception 'Group not found';
  end if;

  v_dashboard := public.get_group_dashboard(p_group_id, v_month);

  select coalesce(jsonb_agg(to_jsonb(s) order by s.member_name), '[]'::jsonb)
    into v_members
  from public.get_collection_sheet(p_group_id, v_month) s;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.member_name), '[]'::jsonb)
    into v_payouts
  from public.get_payout_sheet(p_group_id, v_month) p
  where p.actual_month = v_month or p.scheduled_month = v_month;

  select coalesce(jsonb_agg(jsonb_build_object('method', method, 'amount', amount, 'count', cnt)), '[]'::jsonb)
    into v_methods
  from (
    select pt.payment_method as method, sum(pt.amount) as amount, count(*) as cnt
    from public.payment_transactions pt
    join public.group_memberships gm on gm.id = pt.group_membership_id
    where gm.group_id = p_group_id
      and pt.status = 'posted'
      and pt.payment_date >= v_month
      and pt.payment_date < v_next
    group by pt.payment_method
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object('method', method, 'amount', amount, 'count', cnt)), '[]'::jsonb)
    into v_payout_methods
  from (
    select w.payment_method as method, sum(w.actual_amount) as amount, count(*) as cnt
    from public.withdrawal_transactions w
    join public.group_memberships gm on gm.id = w.group_membership_id
    where gm.group_id = p_group_id
      and w.status = 'paid'
      and w.payment_date >= v_month
      and w.payment_date < v_next
    group by w.payment_method
  ) q;

  return jsonb_build_object(
    'dashboard', v_dashboard,
    'members', v_members,
    'payouts', v_payouts,
    'collection_methods', v_methods,
    'payout_methods', v_payout_methods
  );
end;
$$;

create or replace function public.ledger_protect_actuals()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and (
    new.actual_withdrawal_month is distinct from old.actual_withdrawal_month
    or new.actual_payout_amount is distinct from old.actual_payout_amount
  ) then
    if current_setting('ledger.allow_actual_sync', true) is distinct from 'on' then
      raise exception 'Record a payout to change the actual withdrawal. Do not edit it directly.';
    end if;
  end if;
  return new;
end;
$$;

create trigger memberships_protect_actuals
  before update on public.group_memberships
  for each row execute function public.ledger_protect_actuals();

create or replace function public.ledger_sync_membership_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid := coalesce(new.group_membership_id, old.group_membership_id);
  v_month date;
  v_amount numeric(14,2);
begin
  select w.actual_withdrawal_month, w.actual_amount
    into v_month, v_amount
  from public.withdrawal_transactions w
  where w.group_membership_id = mid and w.status = 'paid'
  limit 1;

  perform set_config('ledger.allow_actual_sync', 'on', true);
  update public.group_memberships
  set actual_withdrawal_month = v_month,
      actual_payout_amount = v_amount
  where id = mid;
  perform set_config('ledger.allow_actual_sync', 'off', true);
  return null;
end;
$$;

create trigger withdrawals_sync_membership
  after insert or update on public.withdrawal_transactions
  for each row execute function public.ledger_sync_membership_withdrawal();
