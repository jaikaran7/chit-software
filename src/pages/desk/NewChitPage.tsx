import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DarkButton, DeskCard, DeskInput, FieldLabel, GhostButton, GreenButton } from '../../components/desk-ui'
import {
  evenAmounts,
  lifetimeCollections,
  readChitMeta,
  readProfile,
  shareMonthCollection,
  steppedAmounts,
  suggestPrizeEnds,
  writeChitMeta,
  writeProfile,
  writeShares,
  type ChitKind,
  type ChitLife,
} from '../../lib/chitMeta'
import { currentMonth, errorMessage, formatMoney, parseAmount, shiftMonth } from '../../lib/format'
import { monthSequence } from '../../lib/payoutPlan'
import { createGroup, listGroups } from '../../services/groups'
import { createMember, getMember, listMembers, updateMember, type MemberListItem } from '../../services/members'
import { addMembership } from '../../services/memberships'
import { importSchedules } from '../../services/schedules'

type Seat = { id: string; name: string; shares: number }
type DraftPerson = { name: string; shares: number; phone: string; phoneOpen: boolean; memberId: string | null }
type PrizeRow = { month: string; amount: string; company: boolean }

function blankDrafts(count: number): DraftPerson[] {
  return Array.from({ length: Math.min(Math.max(count, 0), 60) }, () => ({
    name: '',
    shares: 1,
    phone: '',
    phoneOpen: false,
    memberId: null,
  }))
}

export function NewChitPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [kind, setKind] = useState<ChitKind>('fixed')
  const [showDiff, setShowDiff] = useState(false)
  const [shareTarget, setShareTarget] = useState(20)
  const [monthCount, setMonthCount] = useState(20)
  const [start, setStart] = useState(firstOfNextMonth())
  const [pot, setPot] = useState('500000')
  const [name, setName] = useState('')
  const [named, setNamed] = useState(false)
  const [life, setLife] = useState<ChitLife>('active')
  const [directory, setDirectory] = useState<MemberListItem[]>([])
  const [seats, setSeats] = useState<Seat[]>([])
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState<DraftPerson[]>([])
  const [installmentMode, setInstallmentMode] = useState<'same' | 'varies'>('same')
  const [installment, setInstallment] = useState('25000')
  const [afterInstallment, setAfterInstallment] = useState('25000')
  const [afterEdited, setAfterEdited] = useState(false)
  const [prizes, setPrizes] = useState<PrizeRow[]>([])
  const [firstPrize, setFirstPrize] = useState('')
  const [lastPrize, setLastPrize] = useState('')
  const [prizeStep, setPrizeStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const potAmount = parseAmount(pot)
  const perShare = monthCount > 0 && potAmount > 0 ? Math.round(potAmount / monthCount) : 0

  useEffect(() => {
    listMembers().then(setDirectory).catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    if (installmentMode !== 'same') return
    const next = String(perShare || '')
    setInstallment(next)
    if (!afterEdited) setAfterInstallment(next)
  }, [perShare, installmentMode, afterEdited])

  useEffect(() => {
    const from = params.get('from')
    if (!from) return
    listGroups().then((groups) => {
      const group = groups.find((item) => item.id === from)
      if (!group) return
      const meta = readChitMeta(group.description)
      if (meta.kind) setKind(meta.kind)
      if (meta.shares) setShareTarget(meta.shares)
      if (meta.months) setMonthCount(meta.months)
      if (meta.start) setStart(meta.start.slice(0, 10))
      if (meta.pot) setPot(String(meta.pot))
      setName(`${group.name} copy`)
      setNamed(true)
    }).catch(() => undefined)
  }, [params])

  function goToMoney(nextSeats: Seat[] = seats) {
    const total = nextSeats.reduce((sum, seat) => sum + seat.shares, 0)
    if (total < 1) return setError('Add the members who’ll be in this chit to continue.')
    setSeats(nextSeats)
    const months = monthSequence(start.slice(0, 7), monthCount)
    const ends = suggestPrizeEnds(potAmount)
    const matched = shareTarget === monthCount
    const step = monthCount > 1 ? Math.round((ends.last - ends.first) / (monthCount - 1)) : 0
    const amounts = matched ? evenAmounts(ends.first, ends.last, months.length) : steppedAmounts(ends.first, step, months.length)
    setFirstPrize(String(ends.first || ''))
    setLastPrize(String(ends.last || ''))
    setPrizeStep(String(step || ''))
    setPrizes(months.map((month, index) => ({
      month,
      amount: String(amounts[index] || ''),
      company: false,
    })))
    setError(null)
    setStep(3)
  }

  function applySuggestion() {
    const ends = suggestPrizeEnds(potAmount)
    const step = monthCount > 1 ? Math.round((ends.last - ends.first) / (monthCount - 1)) : 0
    setFirstPrize(String(ends.first))
    setLastPrize(String(ends.last))
    setPrizeStep(String(step))
    const amounts = matchedTurns
      ? evenAmounts(ends.first, ends.last, prizes.length)
      : steppedAmounts(ends.first, step, prizes.length)
    setPrizes(prizes.map((row, index) => ({ ...row, company: false, amount: String(amounts[index] ?? ends.first) })))
  }

  const prizeSpan = Math.max((prizes.length || monthCount) - 1, 1)

  function riseBetween(startRaw: string, endRaw: string) {
    const start = parseAmount(startRaw)
    const end = parseAmount(endRaw)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return ''
    return String(Math.round((end - start) / prizeSpan))
  }

  function onStartPrize(raw: string) {
    const value = raw.replace(/[^\d]/g, '')
    setFirstPrize(value)
    if (shareTarget === monthCount) setPrizeStep(riseBetween(value, lastPrize))
  }

  function onEndPrize(raw: string) {
    const value = raw.replace(/[^\d]/g, '')
    setLastPrize(value)
    setPrizeStep(riseBetween(firstPrize, value))
  }

  function onRisePrize(raw: string) {
    const value = raw.replace(/[^\d]/g, '')
    setPrizeStep(value)
    const start = parseAmount(firstPrize)
    const rise = parseAmount(value)
    if (Number.isFinite(start) && Number.isFinite(rise)) setLastPrize(String(start + rise * prizeSpan))
  }

  function fillPrizes() {
    const first = parseAmount(firstPrize)
    const matched = shareTarget === monthCount
    const amounts = matched
      ? evenAmounts(first, parseAmount(lastPrize), prizes.length)
      : steppedAmounts(first, parseAmount(prizeStep), prizes.length)
    setPrizes(prizes.map((row, index) => ({
      ...row,
      company: false,
      amount: String(amounts[index] ?? first),
    })))
  }

  const normalRate = parseAmount(installment)
  const postRate = parseAmount(afterInstallment) || normalRate
  const matchedTurns = shareTarget === monthCount
  const collectedPlan = useMemo(
    () => lifetimeCollections(monthCount, shareTarget, normalRate, postRate),
    [monthCount, shareTarget, normalRate, postRate],
  )
  const firstMonthTake = shareMonthCollection(0, shareTarget, normalRate, postRate)
  const lastMonthTake = shareMonthCollection(Math.max(monthCount - 1, 0), shareTarget, normalRate, postRate)

  const prizePlan = prizes.reduce((total, row) => total + (row.company ? 0 : parseAmount(row.amount) || 0), 0)
  const commission = collectedPlan - prizePlan

  async function create() {
    if (!(potAmount > 0)) return setError('Enter the prize pot')
    if (commission < 0) return setError('Prizes are more than the members will pay. The company commission would be negative.')
    const rate = normalRate
    const post = postRate
    if (!(rate > 0)) return setError('Enter the monthly installment')
    if (!(post > 0)) return setError('Enter the installment a share pays after withdrawal')
    setBusy(true)
    setError(null)
    try {
      const meta = writeChitMeta({
        v: 1,
        kind,
        pot: potAmount,
        shares: shareTarget,
        months: monthCount,
        start,
        life,
        note: '',
        companyMonths: prizes.filter((row) => row.company).map((row) => row.month),
      })
      const groupId = await createGroup(name.trim() || 'Chit', meta, rate, post)
      const scheduleRows = prizes
        .filter((row) => !row.company && (parseAmount(row.amount) || 0) > 0)
        .map((row) => ({
          month: row.month,
          scheduled_payout_amount: parseAmount(row.amount),
          noted_normal_installment: installmentMode === 'same' ? rate : null,
          noted_post_withdrawal_installment: installmentMode === 'same' ? post : null,
        }))
      if (scheduleRows.length > 0) {
        await importSchedules(groupId, scheduleRows, 'commit', false)
      }
      for (const seat of seats) {
        await addMembership({
          groupId,
          memberId: seat.id,
          joiningDate: start,
          initialAmount: 0,
          notes: writeShares({ shares: seat.shares, pool: [] }, ''),
          scheduledMonth: null,
          scheduledAmount: null,
        })
      }
      navigate(`/?chit=${groupId}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function continueMembers(nextLife?: ChitLife) {
    const ready = drafts.filter((row) => row.name.trim())
    if (ready.length === 0 && seats.length === 0) {
      return setError('Add the members who’ll be in this chit to continue.')
    }
    if (nextLife) setLife(nextLife)
    setBusy(true)
    setError(null)
    try {
      const created: Seat[] = []
      for (const person of ready) {
        if (person.memberId) {
          if (person.phone.trim()) {
            const full = await getMember(person.memberId)
            if (full && (full.mobile ?? '') !== person.phone.trim()) {
              const profile = readProfile(full.notes)
              await updateMember(
                person.memberId,
                full.name,
                person.phone.trim(),
                full.address ?? '',
                writeProfile(profile),
                full.status,
                'Phone added while assigning this chit',
              )
            }
          }
          created.push({ id: person.memberId, name: person.name.trim(), shares: Math.max(1, person.shares) })
        } else {
          const id = await createMember(person.name.trim(), person.phone.trim(), '', '')
          created.push({ id, name: person.name.trim(), shares: Math.max(1, person.shares) })
        }
      }
      const known = new Set(seats.map((seat) => seat.id))
      const nextSeats = [...seats, ...created.filter((seat) => !known.has(seat.id))]
      setDrafts(blankDrafts(Math.max(shareTarget - nextSeats.reduce((sum, seat) => sum + seat.shares, 0), 0)))
      setDirectory(await listMembers())
      goToMoney(nextSeats)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function updateDraft(index: number, patch: Partial<DraftPerson>) {
    setDrafts((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  function fillFromMember(member: MemberListItem) {
    if (seats.some((seat) => seat.id === member.id)) return
    setDrafts((current) => {
      const already = current.some((row) => row.memberId === member.id)
      if (already) return current
      const empty = current.findIndex((row) => !row.name.trim())
      const next = { name: member.name, shares: 1, phone: member.mobile ?? '', phoneOpen: false, memberId: member.id }
      if (empty === -1) return [...current, next]
      return current.map((row, index) => (index === empty ? next : row))
    })
    setQuery('')
  }

  const visibleDirectory = directory.filter((member) => {
    const haystack = `${member.name} ${member.mobile ?? ''}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  return (
    <div className="mx-auto max-w-[760px] pb-8">
      <div className="mb-4 flex items-center gap-3 md:mb-6">
        <Link to="/chits" className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold ring-1 ring-slate-200">← Back</Link>
        <h1 className="text-xl font-semibold md:text-3xl">New Chit Group</h1>
      </div>
      {!named && (
        <DeskCard className="p-5">
          <h2 className="text-lg font-semibold">What is this chit group called?</h2>
          <p className="mt-1 text-sm text-slate-500">The name comes first. Size, members, and the monthly plan come after.</p>
          <div className="mt-4">
            <FieldLabel>Chit group name</FieldLabel>
          </div>
          <DeskInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Family chit" autoFocus />
          <div className="mt-3 flex gap-2">
            {(['draft', 'active'] as const).map((item) => (
              <button key={item} type="button" onClick={() => setLife(item)} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${life === item ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-white ring-1 ring-slate-200'}`}>
                {item}
              </button>
            ))}
          </div>
          <DarkButton
            type="button"
            className="mt-4 w-full"
            disabled={!name.trim()}
            onClick={() => { setNamed(true); setError(null) }}
          >
            Continue
          </DarkButton>
        </DeskCard>
      )}
      {named && (<>
      <ol className="mb-5 flex items-start justify-center text-[11px] md:mb-8 md:text-sm">
        {['Basic Info', 'Assign Members', 'Monthly Plan'].map((label, index) => {
          const number = index + 1
          const done = step > number
          const active = step === number
          return (
            <li key={label} className="flex items-start">
              {index > 0 && <span className={`mx-1 mt-3 h-0.5 w-5 md:mx-3 md:mt-4 md:w-12 ${step > index ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
              <span className="flex w-[4.5rem] flex-col items-center gap-1 text-center md:w-28">
                <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold md:h-8 md:w-8 md:text-sm ${done ? 'bg-emerald-500 text-white' : active ? 'bg-[#111827] text-white' : 'bg-slate-100 text-slate-400 ring-1 ring-slate-200'}`}>
                  {done ? '✓' : number}
                </span>
                <span className={active ? 'font-semibold' : done ? 'text-emerald-700' : 'text-slate-400'}>{label}</span>
              </span>
            </li>
          )
        })}
      </ol>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Start with the basics</h2>
            <p className="text-sm text-slate-500">{name}. The size and value come next — you’ll set the money after the members.</p>
          </div>
          <DeskCard className="p-5">
            <h3 className="font-semibold">Which kind of chit is this?</h3>
            <p className="text-sm text-slate-500">{kind === 'auction' ? 'Members take turns receiving the monthly pot.' : 'You fix every month’s prize up front.'}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Choice selected={kind === 'auction'} tone="amber" onClick={() => setKind('auction')} title="Auction chit" icon={<HammerIcon />} />
              <Choice selected={kind === 'fixed'} tone="green" onClick={() => setKind('fixed')} title="Fixed / company chit" icon={<CalendarIcon />} />
            </div>
            <button type="button" onClick={() => setShowDiff((value) => !value)} className="mx-auto mt-3 flex items-center gap-1 text-sm text-slate-500">
              How are they different?
              <span className={`inline-block transition ${showDiff ? 'rotate-180' : ''}`}>⌄</span>
            </button>
            {showDiff && <ChitDifference />}
          </DeskCard>
          <DeskCard className="p-5">
            <h3 className="font-semibold">How big is the chit?</h3>
            <p className="text-sm text-slate-500">Shares can be held by fewer people. Months can match shares, or you can change them.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Stepper label="Members" hint="Share count" value={shareTarget} onChange={setShareTarget} presets={[10, 20, 25, 50]} />
              <Stepper label="Months" hint="Monthly draws" value={monthCount} onChange={setMonthCount} presets={[10, 20, 25, 50]} sameAs={shareTarget} />
            </div>
            <div className="mt-4">
              <FieldLabel>Start</FieldLabel>
              <DeskInput type="date" value={start} onChange={(event) => setStart(event.target.value)} />
              <div className="mt-2 flex gap-2">
                <GhostButton type="button" onClick={() => setStart(currentMonth())}>This month</GhostButton>
                <GreenButton type="button" onClick={() => setStart(firstOfNextMonth())}>Next month</GreenButton>
              </div>
              <p className="mt-2 text-sm text-slate-500">Collections begin {monthLabel(start)}</p>
            </div>
          </DeskCard>
          <DeskCard className="p-5">
            <FieldLabel>Total value — the prize pot</FieldLabel>
            <DeskInput value={pot} onChange={(event) => setPot(event.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" />
            <p className="mt-2 text-sm text-slate-500">Each share pays {formatMoney(perShare)} in a flat month. You can vary it in the monthly plan.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[100000, 200000, 500000, 1000000].map((amount) => (
                <button key={amount} type="button" onClick={() => setPot(String(amount))} className={`rounded-full px-4 py-2 text-sm font-semibold ${potAmount === amount ? 'bg-[#111827] text-white' : 'bg-white ring-1 ring-slate-200'}`}>
                  {formatMoney(amount)}
                </button>
              ))}
            </div>
          </DeskCard>
          <div className="flex gap-2">
            <GhostButton type="button" onClick={() => navigate('/chits')}>Cancel</GhostButton>
            <DarkButton type="button" className="flex-1" onClick={() => {
              setError(null)
              setDrafts((current) => (current.some((row) => row.name.trim()) ? current : blankDrafts(shareTarget)))
              setStep(2)
            }}>Choose Members →</DarkButton>
          </div>
        </div>
      )}

      {step === 2 && (
        <MemberRoster
          shareTarget={shareTarget}
          seats={seats}
          drafts={drafts}
          query={query}
          matches={query.trim() ? visibleDirectory.slice(0, 6) : []}
          busy={busy}
          ready={seats.length > 0 || drafts.some((row) => row.name.trim())}
          onQuery={setQuery}
          onPick={fillFromMember}
          onAll={() => {
            for (const member of directory) fillFromMember(member)
          }}
          onCancel={() => {
            setQuery('')
            setDrafts(blankDrafts(shareTarget))
            setSeats([])
          }}
          onDraft={updateDraft}
          onAddRow={() => setDrafts((current) => [...current, ...blankDrafts(1)])}
          onSeatShares={(id, shares) => setSeats((current) => current.map((seat) => seat.id === id ? { ...seat, shares } : seat))}
          onRemoveSeat={(id) => setSeats((current) => current.filter((seat) => seat.id !== id))}
          onBack={() => setStep(1)}
          onDraftSave={() => continueMembers('draft')}
          onContinue={() => continueMembers()}
        />
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Set up the money</h2>
            <p className="text-slate-500">What each share pays before and after it withdraws, and the prize for every month. The company keeps the commission.</p>
          </div>
          <DeskCard className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Installment every share pays</h3>
              <div className="flex rounded-full bg-slate-100 p-1 text-sm">
                <button type="button" onClick={() => setInstallmentMode('same')} className={`rounded-full px-3 py-1 ${installmentMode === 'same' ? 'bg-white font-semibold' : ''}`}>Same</button>
                <button type="button" onClick={() => setInstallmentMode('varies')} className={`rounded-full px-3 py-1 ${installmentMode === 'varies' ? 'bg-white font-semibold' : ''}`}>Varies</button>
              </div>
            </div>
            <DeskInput className="mt-3" value={installment} onChange={(event) => setInstallment(event.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" />
            <p className="mt-2 text-sm text-slate-500">
              A share pays this until it takes the prize. The withdrawal month itself still pays this.
            </p>
            <h3 className="mt-5 font-semibold">Installment every share pays after withdrawal</h3>
            <DeskInput
              className="mt-3"
              value={afterInstallment}
              onChange={(event) => {
                setAfterEdited(true)
                setAfterInstallment(event.target.value.replace(/[^\d]/g, ''))
              }}
              inputMode="numeric"
            />
            <p className="mt-2 text-sm text-slate-500">
              One share withdraws each month. From the next month, that share pays this.
              {postRate !== normalRate ? ` That’s ${formatMoney(postRate - normalRate)} extra.` : ''}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Month 1 collects {formatMoney(firstMonthTake)}. The last month collects {formatMoney(lastMonthTake)}, because {Math.min(Math.max(monthCount - 1, 0), shareTarget)} shares are already out and paying the higher amount.
            </p>
          </DeskCard>
          {kind === 'fixed' && (
            <DeskCard className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Prize paid out each month</h3>
                <span className="text-sm text-emerald-700">{prizes.filter((row) => (parseAmount(row.amount) || 0) > 0).length} of {prizes.length} set</span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {matchedTurns
                  ? `${shareTarget} members and ${monthCount} months — everyone withdraws once. The company does not keep a month. It keeps only the commission.`
                  : `${shareTarget} members and ${monthCount} months. Give the first prize, then how much extra to add each month.`}
              </p>
              <button type="button" onClick={applySuggestion} className="mt-3 text-sm font-semibold text-sky-700">
                Suggest for me {formatMoney(suggestPrizeEnds(potAmount).first)} → {formatMoney(suggestPrizeEnds(potAmount).last)}
              </button>
              <div className={`mt-3 grid gap-2 ${matchedTurns ? 'sm:grid-cols-[1fr_1fr_1fr_auto]' : 'sm:grid-cols-[1fr_1fr_auto]'}`}>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Starting amount</span>
                  <DeskInput value={firstPrize} onChange={(event) => onStartPrize(event.target.value)} placeholder="Starting amount" inputMode="numeric" />
                </label>
                {matchedTurns ? (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">Ending amount</span>
                      <DeskInput value={lastPrize} onChange={(event) => onEndPrize(event.target.value)} placeholder="Ending amount" inputMode="numeric" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">Rise each month</span>
                      <DeskInput value={prizeStep} onChange={(event) => onRisePrize(event.target.value)} placeholder="Rise each month" inputMode="numeric" />
                    </label>
                  </>
                ) : (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Extra each month</span>
                    <DeskInput value={prizeStep} onChange={(event) => setPrizeStep(event.target.value.replace(/[^\d]/g, ''))} placeholder="Added per month" inputMode="numeric" />
                  </label>
                )}
                <DarkButton type="button" className="self-end" onClick={fillPrizes}>Fill</DarkButton>
              </div>
              {commission < 0 && <p className="mt-2 text-sm text-rose-600">Prizes are more than the members will pay, so the company commission is negative.</p>}
              <ul className="mt-4 max-h-[420px] space-y-2 overflow-auto">
                {prizes.map((row, index) => (
                  <li key={row.month} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-sm text-slate-500">{monthLabel(row.month)} M{index + 1}</span>
                    <DeskInput value={row.amount} onChange={(event) => setPrizes((current) => current.map((item) => item.month === row.month ? { ...item, amount: event.target.value.replace(/[^\d]/g, '') } : item))} />
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Stat label="Collected" value={formatMoney(collectedPlan)} />
                <Stat label="Prizes out" value={formatMoney(prizePlan)} />
                <Stat label="Commission" value={formatMoney(commission)} accent />
              </div>
            </DeskCard>
          )}
          <div className="flex gap-2">
            <GhostButton type="button" onClick={() => setStep(2)}>Back</GhostButton>
            <DarkButton type="button" className="flex-1" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create chit group'}</DarkButton>
          </div>
        </div>
      )}
      </>)}
    </div>
  )
}

function Choice({ selected, title, onClick, tone, icon }: { selected: boolean; title: string; onClick: () => void; tone: 'amber' | 'green'; icon: ReactNode }) {
  const selectedClass = tone === 'green'
    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
    : 'border-amber-200 bg-amber-50 text-amber-900'
  return (
    <button type="button" onClick={onClick} className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${selected ? selectedClass : 'border-slate-200 bg-white text-slate-600'}`}>
      {icon}
      {title}
    </button>
  )
}

function ChitDifference() {
  const rows = [
    { month: '1', pay: '₹25,000', prize: 'Company', company: true },
    { month: '2', pay: '₹18,750', prize: '₹3,50,000' },
    { month: '3', pay: '₹19,000', prize: '₹3,55,000', highlight: true },
    { month: '4', pay: '₹19,250', prize: '₹3,60,000' },
    { month: '20', pay: '₹25,000', prize: '₹4,75,000' },
  ]
  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <div className="rounded-[28px] bg-slate-50 p-5 text-sm">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700"><HammerIcon /></div>
        <h4 className="mt-4 text-lg font-semibold">Auction chit</h4>
        <p className="mt-1 text-slate-500">Members take turns receiving the monthly pot.</p>
        <p className="mt-4 text-[11px] font-semibold tracking-[0.14em] text-slate-400">HOW IT WORKS</p>
        <ul className="mt-2 space-y-2 text-slate-600">
          <li className="flex gap-2"><span className="text-amber-400">●</span>Everyone pays into a shared pot each month.</li>
          <li className="flex gap-2"><span className="text-amber-400">●</span>One member receives the whole pot that month.</li>
          <li className="flex gap-2"><span className="text-amber-400">●</span>A different member each month — everyone gets one turn.</li>
        </ul>
        <p className="mt-4 text-slate-500">The classic community chit — the app default.</p>
      </div>
      <div className="relative rounded-[28px] border border-emerald-200 bg-emerald-50/60 p-5 text-sm">
        <span className="absolute right-4 top-4 grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-xs text-white">✓</span>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><CalendarIcon /></div>
        <h4 className="mt-4 text-lg font-semibold">Fixed / company chit</h4>
        <p className="mt-1 text-slate-600">You fix every month’s prize up front.</p>
        <p className="mt-3 text-[11px] font-semibold tracking-[0.12em] text-slate-400">EXAMPLE — ₹5,00,000 · 20 MEMBERS · 20 MONTHS</p>
        <div className="mt-2 overflow-hidden rounded-2xl bg-white">
          <div className="grid grid-cols-[48px_1fr_1fr] px-3 py-2 text-[11px] font-semibold tracking-wide text-slate-400">
            <span>MO</span><span>EVERYONE PAYS</span><span>PRIZE</span>
          </div>
          {rows.map((row, index) => (
            <div key={row.month}>
              {index === 4 && <p className="px-3 py-1 text-center text-slate-300">···</p>}
              <div className={`grid grid-cols-[48px_1fr_1fr] px-3 py-2 ${row.highlight ? 'bg-emerald-50' : ''}`}>
                <span className="text-slate-400">{row.month}</span>
                <span>{row.pay}</span>
                <span className={row.company ? 'font-semibold text-violet-600' : 'font-semibold text-emerald-700'}>{row.prize}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-slate-600">
          <span className="text-emerald-600">→</span> You choose who takes <span className="font-semibold text-emerald-700">month 3’s ₹3,55,000</span> prize.
        </p>
      </div>
    </div>
  )
}

function MemberRoster({
  shareTarget,
  seats,
  drafts,
  query,
  matches,
  busy,
  ready,
  onQuery,
  onPick,
  onAll,
  onCancel,
  onDraft,
  onAddRow,
  onSeatShares,
  onRemoveSeat,
  onBack,
  onDraftSave,
  onContinue,
}: {
  shareTarget: number
  seats: Seat[]
  drafts: DraftPerson[]
  query: string
  matches: MemberListItem[]
  busy: boolean
  ready: boolean
  onQuery: (value: string) => void
  onPick: (member: MemberListItem) => void
  onAll: () => void
  onCancel: () => void
  onDraft: (index: number, patch: Partial<DraftPerson>) => void
  onAddRow: () => void
  onSeatShares: (id: string, shares: number) => void
  onRemoveSeat: (id: string) => void
  onBack: () => void
  onDraftSave: () => void
  onContinue: () => void
}) {
  const named = drafts.filter((row) => row.name.trim())
  const shareCount = seats.reduce((sum, seat) => sum + seat.shares, 0) + named.reduce((sum, row) => sum + row.shares, 0)
  const people = seats.length + named.length
  const remaining = Math.max(shareTarget - shareCount, 0)
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Assign Members</h2>
          <p className="max-w-md text-slate-500">Fill {shareTarget} shares — one each, or fewer members holding a bigger share.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${remaining === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
          {shareCount} / {shareTarget} shares
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">{people} member{people === 1 ? '' : 's'} · {shareCount} share{shareCount === 1 ? '' : 's'}</span>
        <span className={remaining === 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
          {remaining === 0 ? 'All shares filled' : `${remaining} more to go`}
        </span>
      </div>
      <div className="flex gap-2">
        <label className="flex h-12 flex-1 items-center gap-2 rounded-2xl bg-white px-4 ring-1 ring-slate-200">
          <span className="text-slate-400">⌕</span>
          <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search by name or phone..." className="w-full bg-transparent outline-none" />
        </label>
        <GhostButton type="button" onClick={onAll}>✓ All</GhostButton>
        <GhostButton type="button" onClick={onCancel}>⌃ Cancel</GhostButton>
      </div>
      {matches.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
          {matches.map((member) => (
            <button key={member.id} type="button" onClick={() => onPick(member)} className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50">
              <span className="font-semibold">{member.name}</span>
              <span className="ml-2 text-slate-400">{member.mobile || 'No phone'}</span>
            </button>
          ))}
        </div>
      )}
      <DeskCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Add {Math.max(drafts.length, 1)} new members</h3>
          <span className="flex items-center gap-1 text-xs text-slate-400"><PhoneIcon /> tap to add phone</span>
        </div>
        <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
          {seats.map((seat, index) => (
            <div key={seat.id} className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-sm text-emerald-700">{index + 1}</span>
              <p className="h-12 flex-1 truncate rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 font-medium">{seat.name}</p>
              <ShareStepper value={seat.shares} onChange={(shares) => onSeatShares(seat.id, shares)} />
              <button type="button" onClick={() => onRemoveSeat(seat.id)} className="grid h-10 w-10 place-items-center rounded-full text-slate-400 ring-1 ring-slate-200" aria-label={`Remove ${seat.name}`}>×</button>
            </div>
          ))}
          {drafts.map((row, index) => (
            <div key={`draft-${index}`} className="flex items-start gap-2">
              <span className="mt-2 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-sm text-slate-500">{seats.length + index + 1}</span>
              <div className="min-w-0 flex-1">
                <input
                  value={row.name}
                  onChange={(event) => onDraft(index, { name: event.target.value, memberId: null })}
                  placeholder="Full name *"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 outline-none ring-emerald-400/30 placeholder:text-slate-300 focus:ring-2"
                />
                {row.phoneOpen && (
                  <input
                    value={row.phone}
                    inputMode="tel"
                    onChange={(event) => onDraft(index, { phone: event.target.value })}
                    placeholder="Enter mobile number if required"
                    className="mt-2 h-11 w-full rounded-2xl border border-slate-200 px-4 outline-none ring-emerald-400/30 placeholder:text-slate-400 focus:ring-2"
                  />
                )}
              </div>
              <div className="mt-2">
                <ShareStepper value={row.shares} onChange={(shares) => onDraft(index, { shares })} />
              </div>
              <button
                type="button"
                aria-label={`Phone for row ${index + 1}`}
                onClick={() => onDraft(index, { phoneOpen: !row.phoneOpen })}
                className={`mt-1 grid h-10 w-10 place-items-center rounded-full ring-1 ${row.phoneOpen || row.phone ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'text-slate-400 ring-slate-200'}`}
              >
                <PhoneIcon />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={onAddRow} className="mt-3 text-sm font-semibold text-emerald-700">+ Add another name</button>
        <p className="mt-4 text-center text-sm text-slate-400">Add the members who’ll be in this chit to continue.</p>
      </DeskCard>
      <div className="flex gap-2">
        <GhostButton type="button" onClick={onBack}>← Back</GhostButton>
        <GhostButton type="button" disabled={busy} onClick={onDraftSave}>Draft</GhostButton>
        <DarkButton type="button" className="flex-1" disabled={!ready || busy} onClick={onContinue}>
          {busy ? 'Saving…' : '₹  Set Monthly Plan  →'}
        </DarkButton>
      </div>
    </div>
  )
}

function ShareStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-1 text-slate-500">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100" aria-label="Fewer shares">−</button>
      <span className="w-8 text-center text-sm font-semibold text-slate-700">{value}x</span>
      <button type="button" onClick={() => onChange(value + 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100" aria-label="More shares">+</button>
    </div>
  )
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M11 18h2" />
    </svg>
  )
}

function HammerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m14 7 3-3 3 3-3 3" />
      <path d="M14 10 4 20" />
      <path d="m6 4 4 4" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  )
}

function Stepper({ label, hint, value, onChange, presets, sameAs }: { label: string; hint: string; value: number; onChange: (value: number) => void; presets: number[]; sameAs?: number }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-4">
      <p className="font-semibold">{label}</p>
      <p className="text-xs text-slate-400">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <GhostButton type="button" onClick={() => onChange(Math.max(1, value - 1))}>−</GhostButton>
        <span className="w-12 text-center text-xl font-semibold">{value}</span>
        <GhostButton type="button" onClick={() => onChange(value + 1)}>+</GhostButton>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {presets.map((preset) => (
          <button key={preset} type="button" onClick={() => onChange(preset)} className="rounded-full bg-white px-2 py-1 text-xs ring-1 ring-slate-200">{preset}</button>
        ))}
        {sameAs != null && <button type="button" onClick={() => onChange(sameAs)} className="rounded-full bg-white px-2 py-1 text-xs ring-1 ring-slate-200">Same</button>}
      </div>
    </div>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${accent ? 'bg-[#14915a] text-white' : 'bg-slate-50'}`}>
      <p className={`text-[11px] font-semibold tracking-wide ${accent ? 'text-emerald-100' : 'text-slate-400'}`}>{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  )
}

function firstOfNextMonth(): string {
  return shiftMonth(currentMonth(), 1)
}

function monthLabel(iso: string): string {
  const [year, month] = iso.slice(0, 7).split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}
