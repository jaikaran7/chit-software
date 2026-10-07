import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Banner, Button, Field, Header, RupeeInput, controlClass } from '../components/ui'
import { currentMonth, errorMessage, formatMoney, formatMonth, parseAmount } from '../lib/format'
import { alignDrafts, fillIncreasing, type PayoutDraft } from '../lib/payoutPlan'
import { createMember, listMembers, type MemberListItem } from '../services/members'
import { addMembership } from '../services/memberships'
import { createGroup, listGroups, updateGroup } from '../services/groups'
import { updateScheme } from '../services/schemes'
import { importSchedules } from '../services/schedules'

export function GroupFormPage() {
  const { groupId } = useParams()
  if (groupId) return <EditGroup groupId={groupId} />
  return <CreateGroup />
}

function EditGroup({ groupId }: { groupId: string }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [normal, setNormal] = useState('')
  const [post, setPost] = useState('')
  const [status, setStatus] = useState('active')
  const [reason, setReason] = useState('')
  const [originalNormal, setOriginalNormal] = useState<number | null>(null)
  const [originalPost, setOriginalPost] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listGroups()
      .then((groups) => {
        const group = groups.find((item) => item.id === groupId)
        if (!group) return
        setName(group.name)
        setDescription(group.description ?? '')
        setStatus(group.status)
        setNormal(group.normalInstallment?.toString() ?? '')
        setPost(group.postWithdrawalInstallment?.toString() ?? '')
        setOriginalNormal(group.normalInstallment)
        setOriginalPost(group.postWithdrawalInstallment)
      })
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [groupId])

  const amountsChanged = Number(normal) !== originalNormal || Number(post) !== originalPost

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await updateGroup(groupId, name, description, status)
      if (amountsChanged) await updateScheme(groupId, Number(normal), Number(post), reason)
      navigate(`/groups/${groupId}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Header title="Edit group" subtitle="The scheme belongs to this group only." />
      <Field label="Group name">
        <input className={controlClass} value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>
      <Field label="Description">
        <input className={controlClass} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <Field label="Normal monthly installment">
        <RupeeInput value={normal} onChange={setNormal} required />
      </Field>
      <Field label="After withdrawal installment">
        <RupeeInput value={post} onChange={setPost} required />
      </Field>
      <Field label="Status">
        <select className={controlClass} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </Field>
      {amountsChanged && (
        <Field label="Reason for installment change">
          <input className={controlClass} value={reason} onChange={(event) => setReason(event.target.value)} required />
        </Field>
      )}
      {amountsChanged && <p className="text-sm text-gold">Changing the scheme changes how monthly dues are calculated.</p>}
      {error && <Banner>{error}</Banner>}
      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save group'}</Button>
    </form>
  )
}

function CreateGroup() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [normal, setNormal] = useState('')
  const [post, setPost] = useState('')
  const [totalMonths, setTotalMonths] = useState('20')
  const [startMonth, setStartMonth] = useState(currentMonth().slice(0, 7))
  const [mode, setMode] = useState<'manual' | 'automatic' | null>(null)
  const [rows, setRows] = useState<PayoutDraft[]>([])
  const [firstPayout, setFirstPayout] = useState('')
  const [sameIncrease, setSameIncrease] = useState(true)
  const [increaseBy, setIncreaseBy] = useState('')
  const [members, setMembers] = useState<MemberListItem[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMobile, setNewMobile] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedGroupId, setSavedGroupId] = useState<string | null>(null)
  const scheduleSaved = useRef(false)
  const addedIds = useRef(new Set<string>())

  useEffect(() => {
    listMembers().then(setMembers).catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  const monthCount = Number(totalMonths)
  const increase = sameIncrease ? parseAmount(increaseBy) : 0

  function alignedRows(previous = rows) {
    return alignDrafts(startMonth, monthCount, previous)
  }

  function applyPattern(previous: PayoutDraft[], resetTouched = false) {
    const base = resetTouched ? previous.map((row) => ({ ...row, touched: false })) : previous
    return fillIncreasing(base, parseAmount(firstPayout), Number.isFinite(increase) ? increase : 0, !resetTouched)
  }

  function chooseMode(next: 'manual' | 'automatic') {
    if (next === mode) return
    setMode(next)
    setError(null)
    setRows((current) => {
      const aligned = alignedRows(current)
      return next === 'automatic' ? applyPattern(aligned, true) : aligned
    })
  }

  function onFirstPayout(value: string) {
    setFirstPayout(value)
    if (mode !== 'automatic') return
    const first = parseAmount(value)
    setRows((current) => fillIncreasing(current, first, Number.isFinite(increase) ? increase : 0))
  }

  function onIncrease(value: string) {
    setIncreaseBy(value)
    if (mode !== 'automatic' || !sameIncrease) return
    const step = parseAmount(value)
    if (!Number.isFinite(step)) return
    setRows((current) => fillIncreasing(current, parseAmount(firstPayout), step))
  }

  function toggleIncrease() {
    const next = !sameIncrease
    setSameIncrease(next)
    if (mode !== 'automatic') return
    const step = next ? parseAmount(increaseBy) : 0
    setRows((current) => fillIncreasing(current, parseAmount(firstPayout), Number.isFinite(step) ? step : 0))
  }

  function editAmount(month: string, amount: string) {
    setRows((current) => current.map((row) => (row.month === month ? { ...row, amount, touched: true } : row)))
  }

  function continueDetails() {
    if (!name.trim()) return setError('Enter a group name')
    if (!(parseAmount(normal) > 0) || !(parseAmount(post) > 0)) return setError('Enter both installment amounts')
    if (!Number.isInteger(monthCount) || monthCount < 1 || monthCount > 120) {
      return setError('Enter the total months, from 1 to 120')
    }
    if (!startMonth) return setError('Choose the starting month')
    setError(null)
    setRows((current) => {
      const aligned = alignDrafts(startMonth, monthCount, current)
      return mode === 'automatic' ? applyPattern(aligned) : aligned
    })
    setStep(2)
  }

  function continueSchedule() {
    if (!mode) return setError('Choose a manual or automatic schedule')
    if (mode === 'automatic' && !(parseAmount(firstPayout) > 0)) return setError('Enter the first month payout')
    if (mode === 'automatic' && sameIncrease && !Number.isFinite(parseAmount(increaseBy))) {
      return setError('Enter how much the payout increases each month')
    }
    if (rows.length === 0 || rows.some((row) => !(parseAmount(row.amount) > 0))) {
      return setError('Enter the amount to pay the candidate for every month')
    }
    setError(null)
    setStep(3)
  }

  const visibleMembers = members.filter((member) => {
    if (member.status !== 'active') return false
    const haystack = `${member.name} ${member.mobile ?? ''}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  function toggleMember(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectVisible() {
    setSelected((current) => {
      const next = new Set(current)
      for (const member of visibleMembers) next.add(member.id)
      return next
    })
  }

  async function saveNewMember() {
    if (!newName.trim()) return setError('Enter the member name')
    setBusy(true)
    setError(null)
    try {
      const id = await createMember(newName.trim(), newMobile.trim(), '', '')
      const nextMembers = await listMembers()
      setMembers(nextMembers)
      setSelected((current) => new Set(current).add(id))
      setNewName('')
      setNewMobile('')
      setAdding(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    setBusy(true)
    setError(null)
    try {
      let groupId = savedGroupId
      if (!groupId) {
        groupId = await createGroup(name.trim(), description.trim(), parseAmount(normal), parseAmount(post))
        setSavedGroupId(groupId)
      }
      await importSchedules(
        groupId,
        rows.map((row) => ({
          month: row.month,
          scheduled_payout_amount: parseAmount(row.amount),
          noted_normal_installment: null,
          noted_post_withdrawal_installment: null,
        })),
        scheduleSaved.current ? 'replace' : 'commit',
        false,
      )
      scheduleSaved.current = true
      const joining = `${startMonth}-01`
      for (const memberId of selected) {
        if (addedIds.current.has(memberId)) continue
        try {
          await addMembership({
            groupId,
            memberId,
            joiningDate: joining,
            initialAmount: 0,
            notes: '',
            scheduledMonth: null,
            scheduledAmount: null,
          })
        } catch (err) {
          if (!errorMessage(err).toLowerCase().includes('already')) throw err
        }
        addedIds.current.add(memberId)
      }
      navigate(`/groups/${groupId}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const subtitles = [
    'Name the group and its installments.',
    'This is the amount you will pay the candidate each month.',
    'Choose people who already exist, or add someone new.',
  ]

  return (
    <div>
      <Header title="New group" subtitle={subtitles[step - 1]} />
      <Stepper step={step} onStep={(next) => next < step && setStep(next)} />
      {error && <div className="mb-3"><Banner>{error}</Banner></div>}

      {step === 1 && (
        <div className="space-y-3">
          <Field label="Group name">
            <input className={controlClass} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Description">
            <input className={controlClass} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Normal monthly installment">
            <RupeeInput value={normal} onChange={setNormal} />
          </Field>
          <Field label="After withdrawal installment">
            <RupeeInput value={post} onChange={setPost} />
          </Field>
          <Field label="Total months">
            <input className={controlClass} inputMode="numeric" value={totalMonths} onChange={(event) => setTotalMonths(event.target.value)} />
          </Field>
          <Field label="Starting month">
            <input className={controlClass} type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} />
          </Field>
          <Button onClick={continueDetails}>Continue</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Normal monthly installment {formatMoney(parseAmount(normal) || 0)} · After withdrawal {formatMoney(parseAmount(post) || 0)}
          </p>
          <div className="space-y-2">
            <ModeCard
              title="Manual schedule"
              body="Enter the payout for each month yourself."
              selected={mode === 'manual'}
              onClick={() => chooseMode('manual')}
            />
            <ModeCard
              title="Automatic schedule"
              body="Start with one amount and raise it every month."
              selected={mode === 'automatic'}
              onClick={() => chooseMode('automatic')}
            />
          </div>
          {mode === 'automatic' && (
            <div className="space-y-3">
              <Field label="First month payout">
                <RupeeInput value={firstPayout} onChange={onFirstPayout} />
              </Field>
              <button
                type="button"
                aria-pressed={sameIncrease}
                onClick={toggleIncrease}
                className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left ring-1 ring-line"
              >
                <span className="text-sm font-medium">Increase by the same amount every month</span>
                <span className={`relative h-7 w-12 shrink-0 rounded-full ${sameIncrease ? 'bg-grove' : 'bg-[#ddd4c6]'}`}>
                  <span className={`absolute top-0.5 size-6 rounded-full bg-white ${sameIncrease ? 'left-5' : 'left-0.5'}`} />
                </span>
              </button>
              {sameIncrease && (
                <Field label="Increase every month by">
                  <RupeeInput value={increaseBy} onChange={onIncrease} />
                </Field>
              )}
              <button type="button" className="text-sm font-semibold text-grove" onClick={() => setRows((current) => applyPattern(current, true))}>
                Refill every month
              </button>
            </div>
          )}
          {mode && (
            <div>
              <h2 className="mb-2 text-sm font-medium">Amount to pay candidate</h2>
              <div className="divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
                {rows.map((row) => (
                  <label key={row.month} className="block px-4 py-3">
                    <span className="mb-1.5 block text-sm font-medium">{formatMonth(row.month)}</span>
                    <RupeeInput value={row.amount} onChange={(value) => editAmount(row.month, value)} />
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button tone="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={continueSchedule}>Continue</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Selected: {selected.size} {selected.size === 1 ? 'member' : 'members'}</p>
            <div className="flex gap-3">
              <button type="button" className="text-sm font-semibold text-grove" onClick={selectVisible}>Select all</button>
              {selected.size > 0 && (
                <button type="button" className="text-sm font-semibold text-muted" onClick={() => setSelected(new Set())}>Clear</button>
              )}
            </div>
          </div>
          <input
            className={controlClass}
            placeholder="Search name or mobile"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {visibleMembers.length === 0 ? (
            <p className="text-sm text-muted">{members.length === 0 ? 'No people yet. Add the first member.' : 'No one matches that search.'}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
              {visibleMembers.map((member) => (
                <li key={member.id}>
                  <label className="flex min-h-14 items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      className="size-5 accent-grove"
                      checked={selected.has(member.id)}
                      onChange={() => toggleMember(member.id)}
                    />
                    <span>
                      <span className="block font-semibold">{member.name}</span>
                      {member.mobile && <span className="block text-sm text-muted">{member.mobile}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {adding ? (
            <div className="space-y-3 rounded-3xl bg-card p-4 ring-1 ring-line">
              <Field label="Name">
                <input className={controlClass} value={newName} onChange={(event) => setNewName(event.target.value)} />
              </Field>
              <Field label="Mobile">
                <input className={controlClass} value={newMobile} onChange={(event) => setNewMobile(event.target.value)} />
              </Field>
              <Button onClick={() => void saveNewMember()} disabled={busy}>{busy ? 'Saving…' : 'Save member'}</Button>
            </div>
          ) : (
            <button type="button" className="text-sm font-semibold text-grove" onClick={() => setAdding(true)}>
              + Add new member
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button tone="ghost" onClick={() => setStep(2)} disabled={busy}>Back</Button>
            <Button onClick={() => void create()} disabled={busy}>{busy ? 'Saving…' : savedGroupId ? 'Finish group' : 'Create group'}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stepper({ step, onStep }: { step: 1 | 2 | 3; onStep: (step: 1 | 2 | 3) => void }) {
  const labels = ['Group', 'Schedule', 'Members']
  return (
    <ol className="mb-5 grid grid-cols-3 gap-2">
      {labels.map((label, index) => {
        const number = (index + 1) as 1 | 2 | 3
        const active = number === step
        return (
          <li key={label}>
            <button
              type="button"
              disabled={number > step}
              onClick={() => onStep(number)}
              className={`w-full rounded-2xl px-2 py-2 text-center ${active ? 'bg-grove text-white' : 'bg-card text-ink ring-1 ring-line'} disabled:opacity-100`}
            >
              <span className={`block text-xs ${active ? 'text-white/80' : 'text-muted'}`}>{number}</span>
              <span className="block text-sm font-semibold">{label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function ModeCard({
  title,
  body,
  selected,
  onClick,
}: {
  title: string
  body: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`w-full rounded-3xl px-4 py-4 text-left ${selected ? 'bg-grove text-white' : 'bg-card text-ink ring-1 ring-line'}`}
    >
      <span className="block font-display text-2xl leading-none">{title}</span>
      <span className={`mt-2 block text-sm ${selected ? 'text-white/80' : 'text-muted'}`}>{body}</span>
    </button>
  )
}
