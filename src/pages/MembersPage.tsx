import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Banner, Button, Field, Header, Kpi, StatusPill, controlClass } from '../components/ui'
import { currentMonth, errorMessage, formatMoney, formatMonth } from '../lib/format'
import { listGroups, type GroupCard } from '../services/groups'
import { createMember, listMembers, type MemberListItem } from '../services/members'
import { getCollectionSheet, type CollectionRow } from '../services/payments'

function groupName(row: MemberListItem['group_memberships'][number]) {
  if (!row.groups) return 'Group'
  return Array.isArray(row.groups) ? row.groups[0]?.name : row.groups.name
}

export function MembersPage({ creating = false }: { creating?: boolean }) {
  const navigate = useNavigate()
  const [members, setMembers] = useState<MemberListItem[]>([])
  const [groups, setGroups] = useState<GroupCard[]>([])
  const [groupId, setGroupId] = useState('')
  const [sheet, setSheet] = useState<CollectionRow[]>([])
  const [sheetGroup, setSheetGroup] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const month = currentMonth()

  useEffect(() => {
    Promise.all([listMembers(), listGroups()])
      .then(([people, groupRows]) => {
        setMembers(people)
        setGroups(groupRows)
      })
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    getCollectionSheet(groupId, month)
      .then((rows) => {
        if (cancelled) return
        setSheet(rows)
        setSheetGroup(groupId)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(errorMessage(err))
        setSheet([])
        setSheetGroup(groupId)
      })
    return () => {
      cancelled = true
    }
  }, [groupId, month])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const id = await createMember(name, mobile, address, notes)
      navigate(`/members/${id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const activeGroups = groups.filter((group) => group.status === 'active')
  const selectedGroup = activeGroups.find((group) => group.id === groupId) ?? groups.find((group) => group.id === groupId)
  const needle = query.trim().toLowerCase()

  const globalResults = useMemo(() => {
    return members.filter((member) => `${member.name} ${member.mobile ?? ''} ${member.member_code}`.toLowerCase().includes(needle))
  }, [members, needle])

  const loadingSheet = Boolean(groupId) && sheetGroup !== groupId
  const currentSheet = sheetGroup === groupId ? sheet : []
  const groupResults = currentSheet.filter((row) => `${row.member_name} ${row.mobile ?? ''}`.toLowerCase().includes(needle))
  const paid = currentSheet.filter((row) => row.status === 'PAID' || row.status === 'ADVANCE').length
  const partial = currentSheet.filter((row) => row.status === 'PARTIAL').length
  const pending = currentSheet.filter((row) => row.status === 'NOT_PAID').length

  if (creating) {
    return (
      <form onSubmit={onCreate} className="space-y-3">
        <Header title="New person" subtitle="A person is global. Their balance in each group is separate." />
        <Field label="Name"><input className={controlClass} value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="Mobile"><input className={controlClass} value={mobile} onChange={(event) => setMobile(event.target.value)} /></Field>
        <Field label="Address"><input className={controlClass} value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
        <Field label="Notes"><input className={controlClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        {error && <Banner>{error}</Banner>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save person'}</Button>
      </form>
    )
  }

  return (
    <div>
      <Header
        title="Members"
        action={<Link to="/members/new" className="rounded-2xl bg-grove px-3 py-2 text-sm font-semibold text-white">Add</Link>}
      />
      {error && <div className="mb-3"><Banner>{error}</Banner></div>}
      <label className="mb-3 block">
        <span className="mb-1.5 block text-sm font-medium">Group</span>
        <select
          className={controlClass}
          value={groupId}
          onChange={(event) => {
            setGroupId(event.target.value)
            setQuery('')
          }}
        >
          <option value="">All groups</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>{group.name}</option>
          ))}
        </select>
      </label>

      {!groupId ? (
        <>
          <div className="mb-3">
            <Kpi label="Total members" value={String(members.length)} />
          </div>
          <div className="divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
            {activeGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setGroupId(group.id)
                  setQuery('')
                }}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="font-semibold">{group.name}</span>
                <span className="text-sm text-muted">{group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}</span>
              </button>
            ))}
          </div>
          <input
            className={`${controlClass} mt-4`}
            placeholder="Search name or mobile"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
            {globalResults.map((member) => {
              const names = member.group_memberships.map(groupName).filter(Boolean)
              return (
                <li key={member.id}>
                  <Link to={`/members/${member.id}`} className="block px-4 py-3">
                    <p className="font-semibold">{member.name}</p>
                    <p className="text-sm text-muted">{member.mobile || 'No mobile'}</p>
                    {names.length > 0 && (
                      <div className="mt-1">
                        {names.map((group) => (
                          <p key={group} className="text-sm text-muted">{group}</p>
                        ))}
                      </div>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
          {globalResults.length === 0 && <p className="mt-3 text-sm text-muted">No members match that search.</p>}
        </>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">{selectedGroup?.name ?? 'Group'} · {formatMonth(month)}</p>
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Total members" value={loadingSheet ? '…' : String(currentSheet.length)} />
            <Kpi label="Paid this month" value={loadingSheet ? '…' : String(paid)} tone="grove" />
            <Kpi label="Partial" value={loadingSheet ? '…' : String(partial)} />
            <Kpi label="Pending" value={loadingSheet ? '…' : String(pending)} tone="clay" />
          </div>
          <input
            className={`${controlClass} mt-4`}
            placeholder={`Search ${selectedGroup?.name ?? 'this group'}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {loadingSheet ? (
            <p className="mt-3 text-sm text-muted">Loading members…</p>
          ) : (
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
              {groupResults.map((row) => (
                <li key={row.membership_id}>
                  <Link to={`/memberships/${row.membership_id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-semibold">{row.member_name}</p>
                      <p className="text-sm text-muted">{formatMoney(row.due)} due</p>
                    </div>
                    <StatusPill status={row.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!loadingSheet && groupResults.length === 0 && <p className="mt-3 text-sm text-muted">No members match that search in this group.</p>}
        </>
      )}
    </div>
  )
}
