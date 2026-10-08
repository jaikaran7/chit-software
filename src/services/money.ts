import { asNumber } from '../lib/format'
import { supabase } from '../lib/supabase'
import { getDashboard, listGroups, type GroupCard } from './groups'
import { shiftMonth } from '../lib/format'

export type MoneyMove = {
  receiptId: string | null
  kind: 'credit' | 'debit'
  memberId: string
  memberName: string
  groupId: string
  groupName: string
  amount: number
  method: string
  status: string
  happenedOn: string
  createdAt: string
}

export type PendingGroup = {
  id: string
  name: string
  pending: number
}

export type MonthMoney = {
  moves: MoneyMove[]
  groups: GroupCard[]
  pendingByGroup: PendingGroup[]
}

type PaymentQuery = {
  id: string
  payment_date: string
  amount: number | string
  payment_method: string
  status: string
  created_at: string
  group_membership_id: string
}

type WithdrawalQuery = {
  id: string
  payment_date: string
  actual_amount: number | string
  payment_method: string
  status: string
  created_at: string
  group_membership_id: string
}

type MembershipQuery = {
  id: string
  group_id: string
  members: { id: string; name: string } | { id: string; name: string }[] | null
  groups: { name: string } | { name: string }[] | null
}

function relatedName(value: { name: string } | { name: string }[] | null | undefined, fallback: string) {
  if (!value) return fallback
  const row = Array.isArray(value) ? value[0] : value
  return row?.name || fallback
}

function byNewest(a: MoneyMove, b: MoneyMove) {
  if (a.happenedOn !== b.happenedOn) return a.happenedOn < b.happenedOn ? 1 : -1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return 0
}

export function isRecorded(status: string) {
  return status === 'posted' || status === 'paid'
}

async function membershipMap(ids: string[]) {
  const map = new Map<string, { groupId: string; groupName: string; memberId: string; memberName: string }>()
  if (ids.length === 0) return map
  const { data, error } = await supabase
    .from('group_memberships')
    .select('id, group_id, members(id, name), groups(name)')
    .in('id', ids)
  if (error) throw error
  for (const row of (data ?? []) as MembershipQuery[]) {
    const member = Array.isArray(row.members) ? row.members[0] : row.members
    map.set(row.id, {
      groupId: row.group_id,
      groupName: relatedName(row.groups, 'Group'),
      memberId: member?.id ?? '',
      memberName: member?.name || 'Member',
    })
  }
  return map
}

async function receiptMap(paymentIds: string[], withdrawalIds: string[]) {
  const byPayment = new Map<string, string>()
  const byWithdrawal = new Map<string, string>()
  const jobs = []
  if (paymentIds.length > 0) {
    jobs.push(
      supabase.from('receipts').select('id, payment_transaction_id').in('payment_transaction_id', paymentIds),
    )
  }
  if (withdrawalIds.length > 0) {
    jobs.push(
      supabase.from('receipts').select('id, withdrawal_transaction_id').in('withdrawal_transaction_id', withdrawalIds),
    )
  }
  const results = await Promise.all(jobs)
  for (const result of results) {
    if (result.error) throw result.error
    for (const row of result.data ?? []) {
      const receipt = row as { id: string; payment_transaction_id?: string | null; withdrawal_transaction_id?: string | null }
      if (receipt.payment_transaction_id) byPayment.set(receipt.payment_transaction_id, receipt.id)
      if (receipt.withdrawal_transaction_id) byWithdrawal.set(receipt.withdrawal_transaction_id, receipt.id)
    }
  }
  return { byPayment, byWithdrawal }
}

export async function listMovesInRange(from: string, to: string): Promise<MoneyMove[]> {
  const [paymentResult, withdrawalResult] = await Promise.all([
    supabase
      .from('payment_transactions')
      .select('id, payment_date, amount, payment_method, status, created_at, group_membership_id')
      .gte('payment_date', from)
      .lte('payment_date', to),
    supabase
      .from('withdrawal_transactions')
      .select('id, payment_date, actual_amount, payment_method, status, created_at, group_membership_id')
      .gte('payment_date', from)
      .lte('payment_date', to),
  ])
  if (paymentResult.error) throw paymentResult.error
  if (withdrawalResult.error) throw withdrawalResult.error
  return movesFromRows(
    (paymentResult.data ?? []) as PaymentQuery[],
    (withdrawalResult.data ?? []) as WithdrawalQuery[],
  )
}

export async function listMoves(month?: string): Promise<MoneyMove[]> {
  let payments = supabase.from('payment_transactions').select('id, payment_date, amount, payment_method, status, created_at, group_membership_id')
  let withdrawals = supabase.from('withdrawal_transactions').select('id, payment_date, actual_amount, payment_method, status, created_at, group_membership_id')
  if (month) {
    const next = shiftMonth(month, 1)
    payments = payments.gte('payment_date', month).lt('payment_date', next)
    withdrawals = withdrawals.gte('payment_date', month).lt('payment_date', next)
  } else {
    payments = payments.order('payment_date', { ascending: false }).order('created_at', { ascending: false }).limit(40)
    withdrawals = withdrawals.order('payment_date', { ascending: false }).order('created_at', { ascending: false }).limit(40)
  }
  const [paymentResult, withdrawalResult] = await Promise.all([payments, withdrawals])
  if (paymentResult.error) throw paymentResult.error
  if (withdrawalResult.error) throw withdrawalResult.error
  return movesFromRows(
    (paymentResult.data ?? []) as PaymentQuery[],
    (withdrawalResult.data ?? []) as WithdrawalQuery[],
  )
}

async function movesFromRows(paymentRows: PaymentQuery[], withdrawalRows: WithdrawalQuery[]) {
  const membershipIds = [...new Set([...paymentRows, ...withdrawalRows].map((row) => row.group_membership_id))]
  const [people, receipts] = await Promise.all([
    membershipMap(membershipIds),
    receiptMap(paymentRows.map((row) => row.id), withdrawalRows.map((row) => row.id)),
  ])
  const moves: MoneyMove[] = [
    ...paymentRows.map((row) => {
      const person = people.get(row.group_membership_id)
      return {
        receiptId: receipts.byPayment.get(row.id) ?? null,
        kind: 'credit' as const,
        memberId: person?.memberId ?? '',
        memberName: person?.memberName ?? 'Member',
        groupId: person?.groupId ?? '',
        groupName: person?.groupName ?? 'Group',
        amount: asNumber(row.amount),
        method: row.payment_method,
        status: row.status,
        happenedOn: row.payment_date,
        createdAt: row.created_at,
      }
    }),
    ...withdrawalRows.map((row) => {
      const person = people.get(row.group_membership_id)
      return {
        receiptId: receipts.byWithdrawal.get(row.id) ?? null,
        kind: 'debit' as const,
        memberId: person?.memberId ?? '',
        memberName: person?.memberName ?? 'Member',
        groupId: person?.groupId ?? '',
        groupName: person?.groupName ?? 'Group',
        amount: asNumber(row.actual_amount),
        method: row.payment_method,
        status: row.status,
        happenedOn: row.payment_date,
        createdAt: row.created_at,
      }
    }),
  ]
  return moves.sort(byNewest)
}

export async function loadMonthMoney(month: string): Promise<MonthMoney> {
  const [moves, groups] = await Promise.all([listMoves(month), listGroups()])
  const dashes = await Promise.all(groups.map((group) => getDashboard(group.id, month)))
  return {
    moves,
    groups,
    pendingByGroup: dashes.map((dash) => ({
      id: dash.group_id,
      name: dash.group_name,
      pending: asNumber(dash.pending),
    })),
  }
}

export function sumMoves(moves: MoneyMove[], kind: 'credit' | 'debit', groupId = '') {
  return moves.reduce((total, move) => {
    if (move.kind !== kind || !isRecorded(move.status)) return total
    if (groupId && move.groupId !== groupId) return total
    return total + move.amount
  }, 0)
}

export async function listMembershipHistory(membershipId: string): Promise<MoneyMove[]> {
  const [paymentResult, withdrawalResult] = await Promise.all([
    supabase
      .from('payment_transactions')
      .select('id, payment_date, amount, payment_method, status, created_at, group_membership_id')
      .eq('group_membership_id', membershipId),
    supabase
      .from('withdrawal_transactions')
      .select('id, payment_date, actual_amount, payment_method, status, created_at, group_membership_id')
      .eq('group_membership_id', membershipId),
  ])
  if (paymentResult.error) throw paymentResult.error
  if (withdrawalResult.error) throw withdrawalResult.error
  const paymentRows = (paymentResult.data ?? []) as PaymentQuery[]
  const withdrawalRows = (withdrawalResult.data ?? []) as WithdrawalQuery[]
  const receipts = await receiptMap(paymentRows.map((row) => row.id), withdrawalRows.map((row) => row.id))
  const moves: MoneyMove[] = [
    ...paymentRows.map((row) => ({
      receiptId: receipts.byPayment.get(row.id) ?? null,
      kind: 'credit' as const,
      memberId: '',
      memberName: '',
      groupId: '',
      groupName: '',
      amount: asNumber(row.amount),
      method: row.payment_method,
      status: row.status,
      happenedOn: row.payment_date,
      createdAt: row.created_at,
    })),
    ...withdrawalRows.map((row) => ({
      receiptId: receipts.byWithdrawal.get(row.id) ?? null,
      kind: 'debit' as const,
      memberId: '',
      memberName: '',
      groupId: '',
      groupName: '',
      amount: asNumber(row.actual_amount),
      method: row.payment_method,
      status: row.status,
      happenedOn: row.payment_date,
      createdAt: row.created_at,
    })),
  ]
  return moves.sort(byNewest)
}
