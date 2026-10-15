-- Add reset_all_data function for organizers to safely clear all their data
-- This DOES NOT delete the auth user, schema, or app settings
-- It only deletes ledger data owned by the calling user

create or replace function public.reset_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_deleted jsonb;
begin
  -- Get the owner_id for the authenticated user
  v_owner_id := auth.uid();
  
  if v_owner_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Verify the user is a ledger owner
  if not exists (select 1 from public.ledger_owners where user_id = v_owner_id) then
    raise exception 'User is not a ledger owner';
  end if;

  -- Delete all data in correct FK dependency order
  -- Using a transaction (implicit in function)
  
  v_deleted := jsonb_build_object(
    'receipts', (select count(*) from public.receipts where owner_id = v_owner_id),
    'payment_allocations', (select count(*) from public.payment_allocations where owner_id = v_owner_id),
    'payment_transactions', (select count(*) from public.payment_transactions where owner_id = v_owner_id),
    'withdrawal_transactions', (select count(*) from public.withdrawal_transactions where owner_id = v_owner_id),
    'payout_schedules', (select count(*) from public.payout_schedules where owner_id = v_owner_id),
    'schedule_import_mappings', (select count(*) from public.schedule_import_mappings where owner_id = v_owner_id),
    'group_memberships', (select count(*) from public.group_memberships where owner_id = v_owner_id),
    'group_schemes', (select count(*) from public.group_schemes where owner_id = v_owner_id),
    'groups', (select count(*) from public.groups where owner_id = v_owner_id),
    'members', (select count(*) from public.members where owner_id = v_owner_id),
    'audit_logs', (select count(*) from public.audit_logs where owner_id = v_owner_id)
  );

  -- Temporarily disable the delete triggers
  -- (They prevent deletes to enforce immutability, but we need to allow this for reset)
  
  -- Delete receipts first (references transactions)
  delete from public.receipts where owner_id = v_owner_id;
  
  -- Delete payment allocations (references payment_transactions)
  delete from public.payment_allocations where owner_id = v_owner_id;
  
  -- Delete payment transactions (references group_memberships)
  delete from public.payment_transactions where owner_id = v_owner_id;
  
  -- Delete withdrawal transactions (references group_memberships)
  delete from public.withdrawal_transactions where owner_id = v_owner_id;
  
  -- Delete payout schedules (references groups)
  delete from public.payout_schedules where owner_id = v_owner_id;
  
  -- Delete schedule import mappings (references groups)
  delete from public.schedule_import_mappings where owner_id = v_owner_id;
  
  -- Delete group memberships (references groups and members)
  delete from public.group_memberships where owner_id = v_owner_id;
  
  -- Delete group schemes (references groups)
  delete from public.group_schemes where owner_id = v_owner_id;
  
  -- Delete groups
  delete from public.groups where owner_id = v_owner_id;
  
  -- Delete members
  delete from public.members where owner_id = v_owner_id;
  
  -- Reset counters
  delete from public.member_counters where owner_id = v_owner_id;
  delete from public.receipt_counters where owner_id = v_owner_id;
  
  -- Delete audit logs
  delete from public.audit_logs where owner_id = v_owner_id;
  
  return jsonb_build_object(
    'success', true,
    'deleted', v_deleted
  );
exception
  when others then
    raise exception 'Reset failed: %', sqlerrm;
end;
$$;

-- We need to drop the delete-blocking triggers for this function to work
-- Instead of dropping them globally, we'll modify them to allow deletes
-- when called from the reset_all_data function

-- Update the ledger_block_delete function to allow deletes from reset_all_data
create or replace function public.ledger_block_delete()
returns trigger
language plpgsql
as $$
begin
  -- Allow deletes if called from reset_all_data function
  -- Check the session context set by reset_all_data
  if current_setting('app.allow_delete', true) = 'true' then
    return old;
  end if;
  
  raise exception 'Records cannot be deleted. Archive the row or post a reversal.';
end;
$$;

-- Update reset_all_data to set the session variable
create or replace function public.reset_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_deleted jsonb;
begin
  -- Get the owner_id for the authenticated user
  v_owner_id := auth.uid();
  
  if v_owner_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Verify the user is a ledger owner
  if not exists (select 1 from public.ledger_owners where user_id = v_owner_id) then
    raise exception 'User is not a ledger owner';
  end if;

  -- Count records before deletion
  v_deleted := jsonb_build_object(
    'receipts', (select count(*) from public.receipts where owner_id = v_owner_id),
    'payment_allocations', (select count(*) from public.payment_allocations where owner_id = v_owner_id),
    'payment_transactions', (select count(*) from public.payment_transactions where owner_id = v_owner_id),
    'withdrawal_transactions', (select count(*) from public.withdrawal_transactions where owner_id = v_owner_id),
    'payout_schedules', (select count(*) from public.payout_schedules where owner_id = v_owner_id),
    'schedule_import_mappings', (select count(*) from public.schedule_import_mappings where owner_id = v_owner_id),
    'group_memberships', (select count(*) from public.group_memberships where owner_id = v_owner_id),
    'group_schemes', (select count(*) from public.group_schemes where owner_id = v_owner_id),
    'groups', (select count(*) from public.groups where owner_id = v_owner_id),
    'members', (select count(*) from public.members where owner_id = v_owner_id),
    'audit_logs', (select count(*) from public.audit_logs where owner_id = v_owner_id)
  );

  -- Set session variable to allow deletes
  perform set_config('app.allow_delete', 'true', true);
  
  -- Delete all data in correct FK dependency order
  -- Delete receipts first (references transactions)
  delete from public.receipts where owner_id = v_owner_id;
  
  -- Delete payment allocations (references payment_transactions)
  delete from public.payment_allocations where owner_id = v_owner_id;
  
  -- Delete payment transactions (references group_memberships)
  delete from public.payment_transactions where owner_id = v_owner_id;
  
  -- Delete withdrawal transactions (references group_memberships)
  delete from public.withdrawal_transactions where owner_id = v_owner_id;
  
  -- Delete payout schedules (references groups)
  delete from public.payout_schedules where owner_id = v_owner_id;
  
  -- Delete schedule import mappings (references groups)
  delete from public.schedule_import_mappings where owner_id = v_owner_id;
  
  -- Delete group memberships (references groups and members)
  delete from public.group_memberships where owner_id = v_owner_id;
  
  -- Delete group schemes (references groups)
  delete from public.group_schemes where owner_id = v_owner_id;
  
  -- Delete groups
  delete from public.groups where owner_id = v_owner_id;
  
  -- Delete members
  delete from public.members where owner_id = v_owner_id;
  
  -- Reset counters
  delete from public.member_counters where owner_id = v_owner_id;
  delete from public.receipt_counters where owner_id = v_owner_id;
  
  -- Delete audit logs
  delete from public.audit_logs where owner_id = v_owner_id;
  
  -- Reset the session variable
  perform set_config('app.allow_delete', 'false', true);
  
  return jsonb_build_object(
    'success', true,
    'deleted', v_deleted
  );
exception
  when others then
    -- Ensure we reset the session variable even on error
    perform set_config('app.allow_delete', 'false', true);
    raise exception 'Reset failed: %', sqlerrm;
end;
$$;

-- Grant execute permission to authenticated users
grant execute on function public.reset_all_data() to authenticated;

comment on function public.reset_all_data is 
  'Permanently deletes all ledger data (groups, members, payments, prizes, receipts) for the authenticated user. Does NOT delete the auth user account or schema.';
