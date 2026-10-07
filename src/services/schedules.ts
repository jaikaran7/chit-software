import { rpc } from '../lib/rpc'
import { supabase } from '../lib/supabase'

export type ScheduleRow = {
  id: string
  month: string
  scheduled_payout_amount: number | string
}

export async function listSchedules(groupId: string): Promise<ScheduleRow[]> {
  const { data, error } = await supabase
    .from('payout_schedules')
    .select('id, month, scheduled_payout_amount')
    .eq('group_id', groupId)
    .order('month')
  if (error) throw error
  return (data ?? []) as ScheduleRow[]
}

export type ImportMapping = {
  month_column: string | null
  payout_column: string | null
  normal_installment_column: string | null
  post_withdrawal_column: string | null
}

export async function getImportMapping(groupId: string): Promise<ImportMapping | null> {
  const { data, error } = await supabase
    .from('schedule_import_mappings')
    .select('month_column, payout_column, normal_installment_column, post_withdrawal_column')
    .eq('group_id', groupId)
    .maybeSingle()
  if (error) throw error
  return data as ImportMapping | null
}

export function saveImportMapping(groupId: string, mapping: ImportMapping) {
  return rpc<void>('save_import_mapping', {
    p_group_id: groupId,
    p_month_column: mapping.month_column,
    p_payout_column: mapping.payout_column,
    p_normal_column: mapping.normal_installment_column,
    p_post_column: mapping.post_withdrawal_column,
  })
}

export type ImportResult = { inserted: number; updated: number; skipped: number }

export function importSchedules(
  groupId: string,
  rows: {
    month: string
    scheduled_payout_amount: number
    noted_normal_installment: number | null
    noted_post_withdrawal_installment: number | null
  }[],
  mode: 'commit' | 'replace' | 'skip',
  applyScheme: boolean,
) {
  return rpc<ImportResult>('import_payout_schedules', {
    p_group_id: groupId,
    p_rows: rows,
    p_mode: mode,
    p_apply_scheme: applyScheme,
    p_source: 'pasted-table',
  })
}
