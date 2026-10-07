import { rpc } from '../lib/rpc'

export type CollectionRow = {
  membership_id: string
  member_id: string
  member_name: string
  member_code: string
  mobile: string | null
  due: number | string
  paid: number | string
  outstanding: number | string
  advance_credit: number | string
  status: string
  joining_outstanding: number | string
}

export function getCollectionSheet(groupId: string, month: string) {
  return rpc<CollectionRow[]>('get_collection_sheet', { p_group_id: groupId, p_month: month })
}

export type CollectionResult = {
  receipt_id: string
  receipt_number: string
  payment_id: string
}

export function recordCollection(input: {
  membershipId: string
  month: string
  paymentDate: string
  amount: number
  method: string
  reference: string
  notes: string
}) {
  return rpc<CollectionResult>('record_collection', {
    p_membership_id: input.membershipId,
    p_month: input.month,
    p_payment_date: input.paymentDate,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference,
    p_notes: input.notes,
  })
}

export function voidCollection(paymentId: string, reason: string) {
  return rpc<void>('void_collection', { p_payment_id: paymentId, p_reason: reason })
}
