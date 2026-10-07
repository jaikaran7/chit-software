import { rpc } from '../lib/rpc'

export function updateScheme(groupId: string, normal: number, post: number, reason: string) {
  return rpc<void>('update_scheme', {
    p_group_id: groupId,
    p_normal: normal,
    p_post: post,
    p_reason: reason,
  })
}
