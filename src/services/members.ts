import { rpc } from '../lib/rpc'
import { supabase } from '../lib/supabase'

export type MemberListItem = {
  id: string
  member_code: string
  name: string
  mobile: string | null
  notes: string | null
  status: string
  group_memberships: { id: string; group_id: string; status: string; groups: { name: string } | { name: string }[] | null }[]
}

export async function listMembers(): Promise<MemberListItem[]> {
  const { data, error } = await supabase
    .from('members')
    .select('id, member_code, name, mobile, notes, status, group_memberships(id, group_id, status, groups(name))')
    .order('name')
  if (error) throw error
  return (data ?? []) as MemberListItem[]
}

export async function getMember(memberId: string) {
  const { data, error } = await supabase
    .from('members')
    .select('id, member_code, name, mobile, address, notes, status, group_memberships(id, group_id, status, joining_date, groups(id, name))')
    .eq('id', memberId)
    .maybeSingle()
  if (error) throw error
  return data
}

export function createMember(name: string, mobile: string, address: string, notes: string) {
  return rpc<string>('create_member', {
    p_name: name,
    p_mobile: mobile,
    p_address: address,
    p_notes: notes,
  })
}

export function updateMember(
  memberId: string,
  name: string,
  mobile: string,
  address: string,
  notes: string,
  status: string,
  reason: string,
) {
  return rpc<void>('update_member', {
    p_member_id: memberId,
    p_name: name,
    p_mobile: mobile,
    p_address: address,
    p_notes: notes,
    p_status: status,
    p_reason: reason,
  })
}
