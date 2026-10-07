import { asNumber } from '../lib/format'
import { rpc } from '../lib/rpc'
import { supabase } from '../lib/supabase'

export type GroupCard = {
  id: string
  name: string
  description: string | null
  status: string
  memberCount: number
  normalInstallment: number | null
  postWithdrawalInstallment: number | null
  createdAt: string | null
}

type GroupRow = {
  id: string
  name: string
  description: string | null
  status: string
  created_at?: string
  group_schemes:
    | { normal_installment: number | string; post_withdrawal_installment: number | string }
    | { normal_installment: number | string; post_withdrawal_installment: number | string }[]
    | null
  group_memberships: { id: string; status: string }[] | null
}

export async function listGroups(): Promise<GroupCard[]> {
  const { data, error } = await supabase
    .from('groups')
    .select(
      'id, name, description, status, created_at, group_schemes(normal_installment, post_withdrawal_installment), group_memberships(id, status)',
    )
    .order('name')
  if (error) throw error
  return ((data ?? []) as GroupRow[]).map((group) => {
    const scheme = Array.isArray(group.group_schemes) ? group.group_schemes[0] : group.group_schemes
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      status: group.status,
      createdAt: group.created_at ?? null,
      memberCount: group.group_memberships?.filter((item) => item.status === 'active').length ?? 0,
      normalInstallment: scheme ? asNumber(scheme.normal_installment) : null,
      postWithdrawalInstallment: scheme ? asNumber(scheme.post_withdrawal_installment) : null,
    }
  })
}

export function createGroup(name: string, description: string, normal: number, post: number) {
  return rpc<string>('create_group_with_scheme', {
    p_name: name,
    p_description: description,
    p_normal: normal,
    p_post: post,
  })
}

export function updateGroup(groupId: string, name: string, description: string, status: string) {
  return rpc<void>('update_group', {
    p_group_id: groupId,
    p_name: name,
    p_description: description,
    p_status: status,
  })
}

export type Dashboard = {
  group_id: string
  group_name: string
  month: string
  member_count: number
  normal_installment: number | string | null
  post_withdrawal_installment: number | string | null
  expected_collection: number | string
  collected: number | string
  pending: number | string
  partial_count: number
  advance: number | string
  joining_outstanding: number | string
  scheduled_payout: number | string | null
  actual_payout_total: number | string
  actual_withdrawal_count: number
}

export function getDashboard(groupId: string, month: string) {
  return rpc<Dashboard>('get_group_dashboard', { p_group_id: groupId, p_month: month })
}
