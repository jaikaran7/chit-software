-- Owner-only reads. Writes go through security-definer functions.
-- Existing enquiry, project, quotation, and invoice tables are not modified.

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
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ledger_select_own on public.%I', t);
    execute format(
      'create policy ledger_select_own on public.%I for select to authenticated using (owner_id = (select auth.uid()))',
      t
    );
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
end $$;

alter table public.ledger_owners enable row level security;
drop policy if exists ledger_select_own on public.ledger_owners;
create policy ledger_select_own on public.ledger_owners
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on table public.ledger_owners from public, anon, authenticated;
grant select on table public.ledger_owners to authenticated;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname <> 'rls_auto_enable'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

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
        'claim_ledger_owner',
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
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
