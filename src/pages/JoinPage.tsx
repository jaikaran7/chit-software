import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Banner, Button, Field, Header, controlClass } from '../components/ui'
import { errorMessage, todayIso } from '../lib/format'
import { addMembership } from '../services/memberships'
import { listMembers, type MemberListItem } from '../services/members'

export function JoinPage() {
  const { groupId = '' } = useParams()
  const navigate = useNavigate()
  const [members, setMembers] = useState<MemberListItem[]>([])
  const [query, setQuery] = useState('')
  const [memberId, setMemberId] = useState('')
  const [joiningDate, setJoiningDate] = useState(todayIso())
  const [initialAmount, setInitialAmount] = useState('0')
  const [notes, setNotes] = useState('')
  const [scheduledMonth, setScheduledMonth] = useState('')
  const [scheduledAmount, setScheduledAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listMembers().then(setMembers).catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  const choices = members.filter((member) => member.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const id = await addMembership({
        groupId,
        memberId,
        joiningDate,
        initialAmount: Number(initialAmount || 0),
        notes,
        scheduledMonth: scheduledMonth ? `${scheduledMonth}-01` : null,
        scheduledAmount: scheduledAmount === '' ? null : Number(scheduledAmount),
      })
      navigate(`/memberships/${id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Header title="Add to group" subtitle="Set the joining date and any catch-up the owner decides. It is not a fixed rule." />
      <Field label="Find person">
        <input className={controlClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
      </Field>
      <div className="space-y-2">
        {choices.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => setMemberId(member.id)}
            className={`w-full rounded-2xl px-3 py-3 text-left ${memberId === member.id ? 'bg-grove text-white' : 'bg-card ring-1 ring-line'}`}
          >
            <span className="font-semibold">{member.name}</span>
            <span className="mt-1 block text-sm opacity-80">{member.member_code}</span>
          </button>
        ))}
      </div>
      <Field label="Joining date">
        <input className={controlClass} type="date" value={joiningDate} onChange={(event) => setJoiningDate(event.target.value)} required />
      </Field>
      <Field label="Initial / catch-up amount">
        <input className={controlClass} inputMode="decimal" value={initialAmount} onChange={(event) => setInitialAmount(event.target.value)} />
      </Field>
      <Field label="Notes">
        <input className={controlClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <Field label="Scheduled withdrawal month">
        <input className={controlClass} type="month" value={scheduledMonth} onChange={(event) => setScheduledMonth(event.target.value)} />
      </Field>
      <Field label="Scheduled payout, if you want to override the schedule">
        <input className={controlClass} inputMode="decimal" value={scheduledAmount} onChange={(event) => setScheduledAmount(event.target.value)} placeholder="Leave blank to use the group schedule" />
      </Field>
      {error && <Banner>{error}</Banner>}
      <Button type="submit" disabled={busy || !memberId}>{busy ? 'Saving…' : 'Add membership'}</Button>
    </form>
  )
}
