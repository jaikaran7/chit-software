-- The ledger does not use login. One internal owner row is created automatically.

alter table public.ledger_owners drop constraint if exists ledger_owners_user_id_fkey;

delete from auth.users where id in (select user_id from public.ledger_owners);

create or replace function public.assert_ledger_owner()
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  select user_id into uid from public.ledger_owners limit 1;
  if uid is null then
    uid := gen_random_uuid();
    insert into public.ledger_owners (user_id) values (uid);
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
begin
  return public.assert_ledger_owner();
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'groups',
    'group_schemes',
    'members',
    'member_counters',
    'group_memberships',
    'payout_schedules',
    'schedule_import_mappings',
    'payment_transactions',
    'payment_allocations',
    'withdrawal_transactions',
    'receipt_counters',
    'receipts',
    'audit_logs'
  ]
  loop
    execute format('drop policy if exists ledger_select_own on public.%I', t);
    execute format(
      'create policy ledger_select_own on public.%I for select to anon, authenticated using (true)',
      t
    );
    execute format('grant select on table public.%I to anon', t);
  end loop;
end $$;

drop policy if exists ledger_select_own on public.ledger_owners;
create policy ledger_select_own on public.ledger_owners
  for select to anon, authenticated
  using (true);
grant select on table public.ledger_owners to anon;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_group_with_scheme',
        'update_group',
        'update_scheme',
        'create_member',
        'update_member',
        'add_group_membership',
        'update_group_membership',
        'assign_scheduled_withdrawal',
        'save_import_mapping',
        'import_payout_schedules',
        'record_collection',
        'void_collection',
        'record_payout',
        'update_actual_withdrawal',
        'void_payout',
        'allocate_payment',
        'calculate_member_monthly_due',
        'calculate_outstanding_balance',
        'calculate_advance_credit',
        'calculate_group_expected_collection',
        'calculate_group_collected_amount',
        'calculate_group_pending_amount',
        'calculate_group_payout_amount',
        'calculate_member_payment_status',
        'calculate_post_withdrawal_installment',
        'get_actual_withdrawal_status',
        'get_collection_sheet',
        'get_group_dashboard',
        'get_member_statement',
        'get_payout_sheet',
        'get_group_report',
        'get_receipt',
        'list_recent_activity'
      )
  loop
    execute format('grant execute on function %s to anon', r.sig);
  end loop;
end $$;

revoke all on function public.claim_ledger_owner() from public, anon, authenticated;
revoke all on function public.assert_ledger_owner() from public, anon, authenticated;

notify pgrst, 'reload schema';
