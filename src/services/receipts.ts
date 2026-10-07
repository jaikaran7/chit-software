import { rpc } from '../lib/rpc'

export type ReceiptView = {
  id: string
  receipt_number: string
  receipt_type: 'COLLECTION' | 'PAYOUT'
  created_at: string
  group_name: string
  member_name: string
  member_code: string
  payment_date: string
  payment_method: string
  amount?: number | string
  reference_number?: string | null
  notes?: string | null
  status: string
  void_reason?: string | null
  payment_id?: string
  withdrawal_id?: string
  allocations?: { allocation_kind: string; due_month: string | null; allocated_amount: number | string }[]
  scheduled_month?: string | null
  scheduled_amount?: number | string | null
  actual_month?: string | null
  actual_amount?: number | string | null
  adjustment_reason?: string | null
}

export function getReceipt(receiptId: string) {
  return rpc<ReceiptView>('get_receipt', { p_receipt_id: receiptId })
}

export type ActivityItem = {
  kind: 'COLLECTION' | 'PAYOUT'
  receipt_id: string
  receipt_number: string
  happened_on: string
  amount: number | string
  payment_method: string
  status: string
  member_name: string
  group_name: string
  scheduled_month: string | null
  scheduled_amount: number | string | null
  actual_month: string | null
}

export function listRecentActivity(limit = 40) {
  return rpc<ActivityItem[]>('list_recent_activity', { p_limit: limit })
}
