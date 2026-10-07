import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar, avatarTone } from '../../components/desk-ui'
import { readProfile } from '../../lib/chitMeta'
import { errorMessage } from '../../lib/format'
import { listMembers, type MemberListItem } from '../../services/members'

export function MembersDeskPage() {
  const [params] = useSearchParams()
  const [members, setMembers] = useState<MemberListItem[]>([])
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listMembers().then(setMembers).catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  const rows = members.filter((member) => {
    const profile = readProfile(member.notes)
    const haystack = `${member.name} ${member.mobile ?? ''} ${profile.email}`.toLowerCase()
    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false
    return member.status === 'active'
  })

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex h-12 min-w-[240px] flex-1 items-center rounded-full bg-white px-4 ring-1 ring-slate-200">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone, email..."
            className="w-full bg-transparent outline-none"
          />
        </label>
        <Link to="/members/new" className="rounded-full bg-[#111827] px-4 py-2.5 text-sm font-semibold text-white">
          + Add Member
        </Link>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        {rows.length} members
      </p>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <div className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-5 py-3 font-semibold">NAME</th>
              <th className="px-3 py-3 font-semibold">PHONE</th>
              <th className="px-3 py-3 font-semibold">EMAIL</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((member) => {
              const profile = readProfile(member.notes)
              return (
                <tr key={member.id} className="border-t border-slate-100">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={member.name} tone={avatarTone(member.name)} />
                      <span className="font-semibold">{member.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-slate-500">{member.mobile || '—'}</td>
                  <td className="px-3 py-4 text-slate-500">{profile.email || '—'}</td>
                  <td className="px-4 py-4 text-right">
                    <Link to={`/members/${member.id}`} className="text-slate-400" aria-label={`Edit ${member.name}`}>✎</Link>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-slate-400">No members match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
