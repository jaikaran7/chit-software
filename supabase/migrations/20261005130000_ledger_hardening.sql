-- Trigger helpers are not part of the API. Pin search_path so a caller cannot shadow them.
alter function public.ledger_month(date) set search_path = public;
alter function public.ledger_set_updated_at() set search_path = public;
alter function public.ledger_block_delete() set search_path = public;
alter function public.ledger_normalize_membership_months() set search_path = public;
alter function public.ledger_normalize_withdrawal_months() set search_path = public;
alter function public.ledger_guard_allocation_total() set search_path = public;
alter function public.ledger_protect_actuals() set search_path = public;

-- Event trigger only. The other app still creates tables with RLS; the API must not call this.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
