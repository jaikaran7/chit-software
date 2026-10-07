import { rpc } from '../lib/rpc'
import { supabase } from '../lib/supabase'

export function addMembership(input: {
  groupId: string
  memberId: string
  joiningDate: string
  initialAmount: number
  notes: string
  scheduledMonth: string | null
  scheduledAmount: number | null
}) {
  return rpc<string>('add_group_membership', {
    p_group_id: input.groupId,
    p_member_id: input.memberId,
    p_joining_date: input.joiningDate,
    p_initial_amount: input.initialAmount,
    p_notes: input.notes,
    p_scheduled_month: input.scheduledMonth,
    p_scheduled_amount: input.scheduledAmount,
  })
}

export function updateMembership(input: {
  membershipId: string
  status: string
  joiningDate: string
  initialAmount: number
  notes: string
  reason: string
}) {
  return rpc<void>('update_group_membership', {
    p_membership_id: input.membershipId,
    p_status: input.status,
    p_joining_date: input.joiningDate,
    p_initial_amount: input.initialAmount,
    p_notes: input.notes,
    p_reason: input.reason,
  })
}

export function assignScheduledWithdrawal(
  membershipId: string,
  month: string | null,
  amount: number | null,
  reason: string,
) {
  return rpc<void>('assign_scheduled_withdrawal', {
    p_membership_id: membershipId,
    p_month: month,
    p_amount: amount,
    p_reason: reason,
  })
}

export type StatementRow = {
  month: string
  due: number | string
  paid: number | string
  outstanding: number | string
  advance_credit: number | string
  status: string
  joining_due: number | string
  joining_outstanding: number | string
}

export function getStatement(membershipId: string, through: string) {
  return rpc<StatementRow[]>('get_member_statement', {
    p_membership_id: membershipId,
    p_through: through,
  })
}

export async function getMembership(membershipId: string) {
  const { data, error } = await supabase
    .from('group_memberships')
    .select(
      `id, group_id, member_id, joining_date, status, scheduled_withdrawal_month, scheduled_payout_amount,
       actual_withdrawal_month, actual_payout_amount, initial_amount, notes,
       groups(id, name, group_schemes(normal_installment, post_withdrawal_installment)),
       members(id, name, member_code, mobile)`,
    )
    .eq('id', membershipId)
    .maybeSingle()
  if (error) throw error
  return data
}
