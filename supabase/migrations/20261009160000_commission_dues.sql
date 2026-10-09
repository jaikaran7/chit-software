-- Commission chits charge every share the same rising installment.
-- Month 0 of the chit is the scheme's normal installment. Each later month adds installmentRise from the group description.
-- Withdrawal does not change the amount.

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
  v_description text;
  v_shares numeric(14,2) := 1;
  v_pay text;
  v_rise numeric(14,2);
  v_start date;
  v_offset integer;
begin
  select gm.owner_id, public.ledger_month(gm.joining_date), gs.normal_installment, gs.post_withdrawal_installment, gm.notes, g.description
    into v_owner, v_join, v_normal, v_post, v_notes, v_description
  from public.group_memberships gm
  join public.group_schemes gs on gs.group_id = gm.group_id
  join public.groups g on g.id = gm.group_id
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

  if v_description is not null and left(btrim(v_description), 1) = '{' then
    begin
      v_pay := v_description::jsonb ->> 'pay';
      if nullif(v_description::jsonb ->> 'installmentRise', '') is not null then
        v_rise := round((v_description::jsonb ->> 'installmentRise')::numeric, 2);
      end if;
      if nullif(v_description::jsonb ->> 'start', '') is not null then
        v_start := public.ledger_month((v_description::jsonb ->> 'start')::date);
      end if;
    exception
      when others then
        v_pay := null;
    end;
  end if;

  if v_pay = 'commission' then
    if v_start is null then
      v_start := v_join;
    end if;
    v_offset := (extract(year from v_month)::int - extract(year from v_start)::int) * 12
      + (extract(month from v_month)::int - extract(month from v_start)::int);
    if v_offset < 0 then
      v_offset := 0;
    end if;
    return round((v_normal + coalesce(v_rise, 0) * v_offset) * v_shares, 2);
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
