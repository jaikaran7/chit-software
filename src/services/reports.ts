import type { Dashboard } from './groups'
import type { CollectionRow } from './payments'
import type { PayoutRow } from './withdrawals'
import { rpc } from '../lib/rpc'

export type MethodTotal = { method: string; amount: number | string; count: number }

export type GroupReport = {
  dashboard: Dashboard
  members: CollectionRow[]
  payouts: PayoutRow[]
  collection_methods: MethodTotal[]
  payout_methods: MethodTotal[]
}

export function getGroupReport(groupId: string, month: string) {
  return rpc<GroupReport>('get_group_report', { p_group_id: groupId, p_month: month })
}
