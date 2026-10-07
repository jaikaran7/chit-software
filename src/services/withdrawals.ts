import { rpc } from '../lib/rpc'

export type PayoutRow = {
  membership_id: string
  member_id: string
  member_name: string
  member_code: string
  scheduled_month: string | null
  scheduled_amount: number | string | null
  actual_month: string | null
  actual_amount: number | string | null
  withdrawal_id: string | null
  withdrawal_status: string
  payment_method: string | null
  payment_date: string | null
}

export function getPayoutSheet(groupId: string, month: string) {
  return rpc<PayoutRow[]>('get_payout_sheet', { p_group_id: groupId, p_month: month })
}

export type PayoutResult = {
  receipt_id: string
  receipt_number: string
  withdrawal_id: string
  scheduled_month: string | null
  scheduled_amount: number | string | null
  actual_month: string
  actual_amount: number | string
}

export function recordPayout(input: {
  membershipId: string
  actualMonth: string
  actualAmount: number
  paymentDate: string
  method: string
  adjustmentReason: string
  notes: string
}) {
  return rpc<PayoutResult>('record_payout', {
    p_membership_id: input.membershipId,
    p_actual_month: input.actualMonth,
    p_actual_amount: input.actualAmount,
    p_payment_date: input.paymentDate,
    p_method: input.method,
    p_adjustment_reason: input.adjustmentReason,
    p_notes: input.notes,
  })
}

export function updateActualWithdrawal(withdrawalId: string, month: string, amount: number, reason: string) {
  return rpc<void>('update_actual_withdrawal', {
    p_withdrawal_id: withdrawalId,
    p_actual_month: month,
    p_actual_amount: amount,
    p_reason: reason,
  })
}

export function voidPayout(withdrawalId: string, reason: string) {
  return rpc<void>('void_payout', { p_withdrawal_id: withdrawalId, p_reason: reason })
}
