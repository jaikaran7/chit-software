import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Banner, Button, Card, Field, Header, controlClass } from '../components/ui'
import { errorMessage } from '../lib/format'
import { getMember, updateMember } from '../services/members'

type MemberDetail = NonNullable<Awaited<ReturnType<typeof getMember>>>

function relatedName(groups: { name: string } | { name: string }[] | null) {
  if (!groups) return 'Group'
  return Array.isArray(groups) ? groups[0]?.name ?? 'Group' : groups.name
}

export function MemberPage() {
  const { memberId = '' } = useParams()
  const [member, setMember] = useState<MemberDetail | null>(null)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('active')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getMember(memberId).then((row) => {
      if (!row) return
      setMember(row as MemberDetail)
      setName(row.name)
      setMobile(row.mobile ?? '')
      setAddress(row.address ?? '')
      setNotes(row.notes ?? '')
      setStatus(row.status)
    }).catch((err: unknown) => setError(errorMessage(err)))
  }, [memberId])

  async function onSave(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSaved(false)
    try {
      await updateMember(memberId, name, mobile, address, notes, status, reason)
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const memberships = (member?.group_memberships ?? []) as {
    id: string
    status: string
    groups: { name: string } | { name: string }[] | null
  }[]

  return (
    <div className="space-y-3">
      <Header title={name || 'Member'} subtitle={member?.member_code} />
      <p className="text-sm text-muted">Balances are kept inside each group. Opening a group does not mix the others.</p>
      {memberships.map((membership) => (
        <Link key={membership.id} to={`/memberships/${membership.id}`} className="block">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">{relatedName(membership.groups)}</h2>
              <span className="text-sm text-muted">{membership.status}</span>
            </div>
          </Card>
        </Link>
      ))}
      <form onSubmit={onSave} className="space-y-3">
        <Field label="Name"><input className={controlClass} value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="Mobile"><input className={controlClass} value={mobile} onChange={(event) => setMobile(event.target.value)} /></Field>
        <Field label="Address"><input className={controlClass} value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
        <Field label="Notes"><input className={controlClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        <Field label="Status">
          <select className={controlClass} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        {member && status !== member.status && (
          <Field label="Reason for status change">
            <input className={controlClass} value={reason} onChange={(event) => setReason(event.target.value)} required />
          </Field>
        )}
        {error && <Banner>{error}</Banner>}
        {saved && <p className="text-sm text-grove">Saved.</p>}
        <Button type="submit">Save person</Button>
      </form>
    </div>
  )
}
