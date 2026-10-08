import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DarkButton, DeskCard, DeskInput, FieldLabel, GhostButton, GreenButton } from '../../components/desk-ui'
import { evenAmounts, marginForPlan, readChitMeta, readShares, steppedAmounts, writeChitMeta, writeShares, type ChitLife } from '../../lib/chitMeta'
import { asNumber, errorMessage, formatMoney } from '../../lib/format'
import { listGroups, updateGroup, type GroupCard } from '../../services/groups'
import { createMember, listMembers, type MemberListItem } from '../../services/members'
import { addMembership, updateMembership } from '../../services/memberships'
import { updateScheme } from '../../services/schemes'
import { importSchedules, listSchedules, type ScheduleRow } from '../../services/schedules'
import { supabase } from '../../lib/supabase'

type Seat = {
  id: string
  memberId: string
  name: string
  shares: number
  notes: string | null
  joiningDate: string
  initialAmount: number
  status: string
}

export function ChitEditorPage() {
  const { groupId = '' } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'details' | 'members'>('details')
  const [group, setGroup] = useState<GroupCard | null>(null)
  const [name, setName] = useState('')
  const [life, setLife] = useState<ChitLife>('active')
  const [shares, setShares] = useState(0)
  const [months, setMonths] = useState(0)
  const [start, setStart] = useState('')
  const [pot, setPot] = useState('')
  const [normal, setNormal] = useState('')
  const [afterRate, setAfterRate] = useState('')
  const [plan, setPlan] = useState<{ month: string; amount: string }[]>([])
  const [firstPrize, setFirstPrize] = useState('')
  const [lastPrize, setLastPrize] = useState('')
  const [rise, setRise] = useState('')
  const [planBusy, setPlanBusy] = useState(false)
  const [seats, setSeats] = useState<Seat[]>([])
  const [directory, setDirectory] = useState<MemberListItem[]>([])
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [splitFor, setSplitFor] = useState<Seat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    const [groups, people, plan, membershipResult] = await Promise.all([
      listGroups(),
      listMembers(),
      listSchedules(groupId),
      supabase
        .from('group_memberships')
        .select('id, member_id, notes, joining_date, initial_amount, status, members(name)')
        .eq('group_id', groupId),
    ])
    if (membershipResult.error) throw membershipResult.error
    const found = groups.find((item) => item.id === groupId) ?? null
    setGroup(found)
    setDirectory(people)
    setSchedules(plan)
    if (found) {
      const meta = readChitMeta(found.description)
      setName(found.name)
      setLife(found.status === 'archived' ? 'completed' : meta.life)
      setShares(meta.shares ?? found.memberCount)
      setMonths(meta.months ?? plan.length)
      setStart(meta.start?.slice(0, 10) ?? '')
      setPot(meta.pot ? String(meta.pot) : '')
      setNormal(found.normalInstallment ? String(found.normalInstallment) : '')
      setAfterRate(found.postWithdrawalInstallment ? String(found.postWithdrawalInstallment) : '')
      const rows = plan.map((row) => ({ month: row.month.slice(0, 10), amount: String(Math.round(asNumber(row.scheduled_payout_amount))) }))
      setPlan(rows)
      if (rows.length > 0) {
        const first = Number(rows[0].amount)
        const last = Number(rows[rows.length - 1].amount)
        setFirstPrize(String(first))
        setLastPrize(String(last))
        setRise(String(Math.round((last - first) / Math.max(rows.length - 1, 1))))
      }
    }
    setSeats(((membershipResult.data ?? []) as MembershipQuery[]).map((row) => {
      const member = Array.isArray(row.members) ? row.members[0] : row.members
      const share = readShares(row.notes)
      return {
        id: row.id,
        memberId: row.member_id,
        name: member?.name ?? 'Member',
        shares: share.shares,
        notes: row.notes,
        joiningDate: row.joining_date,
        initialAmount: asNumber(row.initial_amount),
        status: row.status,
      }
    }))
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(errorMessage(err)))
  }, [groupId])

  const activeSeats = seats.filter((seat) => seat.status === 'active')
  const filled = activeSeats.reduce((total, seat) => total + seat.shares, 0)
  const rate = Number(normal) || 0
  const prizeTotal = schedules.reduce((total, row) => total + asNumber(row.scheduled_payout_amount), 0)
  const collectedPlan = rate * Math.max(filled, shares || filled) * Math.max(months, schedules.length, 1)
  const meta = readChitMeta(group?.description)

  async function saveDetails(event: FormEvent) {
    event.preventDefault()
    if (!group) return
    setBusy(true)
    setError(null)
    try {
      const next = writeChitMeta({
        ...meta,
        pot: Number(pot) || null,
        shares: shares || null,
        months: months || null,
        start: start || null,
        life: life === 'completed' ? 'completed' : life,
      })
      await updateGroup(groupId, name.trim(), next, life === 'completed' ? 'archived' : 'active')
      const previousStart = meta.start?.slice(0, 7)
      const nextStart = start.slice(0, 7)
      if (previousStart && nextStart && previousStart !== nextStart) {
        const moving = seats.filter((seat) => seat.status === 'active' && seat.joiningDate.slice(0, 7) === previousStart)
        for (const seat of moving) {
          await updateMembership({
            membershipId: seat.id,
            status: seat.status,
            joiningDate: start,
            initialAmount: seat.initialAmount,
            notes: seat.notes ?? '',
            reason: 'Chit start month updated',
          })
        }
      }
      if (rate > 0 && rate !== group.normalInstallment) {
        await updateScheme(groupId, rate, rate, 'Installment updated from the chit editor')
      }
      await reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function savePlan() {
    if (!group || plan.length === 0) return
    setPlanBusy(true)
    setError(null)
    try {
      const rate = Number(normal) || 0
      const post = Number(afterRate) || rate
      await importSchedules(
        groupId,
        plan.filter((row) => Number(row.amount) > 0).map((row) => ({
          month: row.month,
          scheduled_payout_amount: Number(row.amount),
          noted_normal_installment: rate || null,
          noted_post_withdrawal_installment: post || null,
        })),
        'replace',
        false,
      )
      if (rate > 0 && post > 0 && (rate !== group.normalInstallment || post !== group.postWithdrawalInstallment)) {
        await updateScheme(groupId, rate, post, 'Monthly plan updated')
      }
      await reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPlanBusy(false)
    }
  }

  async function changeShares(seat: Seat, nextShares: number) {
    const shares = Math.max(1, nextShares)
    setSeats((current) => current.map((item) => item.id === seat.id ? { ...item, shares } : item))
    try {
      await updateMembership({
        membershipId: seat.id,
        status: seat.status,
        joiningDate: seat.joiningDate,
        initialAmount: seat.initialAmount,
        notes: writeShares({ shares, pool: readShares(seat.notes).pool }, seat.notes),
        reason: 'Share count updated',
      })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function leave(seat: Seat) {
    try {
      await updateMembership({
        membershipId: seat.id,
        status: 'inactive',
        joiningDate: seat.joiningDate,
        initialAmount: seat.initialAmount,
        notes: seat.notes ?? '',
        reason: 'Member left the chit',
      })
      await reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="mx-auto max-w-[760px] pb-28">
      <div className="mb-4 flex items-center gap-3">
        <Link to="/chits" className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-slate-200">← Back</Link>
        <div>
          <h1 className="text-xl font-semibold md:text-3xl">Edit Chit Group</h1>
          <p className="text-sm text-slate-500">{pot ? formatMoney(Number(pot)) : 'Chit'} · {activeSeats.length} members · {life}</p>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 rounded-full bg-white p-1 ring-1 ring-slate-200">
        <button type="button" onClick={() => setTab('details')} className={`rounded-full py-2 text-sm font-semibold ${tab === 'details' ? 'bg-sky-100 text-sky-900' : 'text-slate-500'}`}>Chit details</button>
        <button type="button" onClick={() => setTab('members')} className={`rounded-full py-2 text-sm font-semibold ${tab === 'members' ? 'bg-sky-100 text-sky-900' : 'text-slate-500'}`}>Members</button>
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      {tab === 'details' && (
        <form onSubmit={saveDetails} className="space-y-4">
          <DeskCard className="p-5">
            <FieldLabel>Chit name</FieldLabel>
            <DeskInput value={name} onChange={(event) => setName(event.target.value)} required />
            <p className="mb-2 mt-4 text-sm text-slate-500">Status</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(['draft', 'active', 'completed'] as const).map((item) => (
                <button key={item} type="button" onClick={() => setLife(item)} className={`rounded-2xl px-3 py-3 text-sm font-semibold capitalize ${life === item ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-white ring-1 ring-slate-200'}`}>
                  {item}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>Member shares</FieldLabel>
                <DeskInput value={String(shares)} onChange={(event) => setShares(Number(event.target.value) || 0)} inputMode="numeric" />
                <p className="mt-1 text-xs text-slate-400">{filled} assigned across {activeSeats.length} people</p>
              </div>
              <div>
                <FieldLabel>Duration</FieldLabel>
                <DeskInput value={String(months)} onChange={(event) => setMonths(Number(event.target.value) || 0)} inputMode="numeric" />
              </div>
            </div>
            <div className="mt-4">
              <FieldLabel>Start month</FieldLabel>
              <DeskInput type="date" value={start} onChange={(event) => setStart(event.target.value)} />
            </div>
          </DeskCard>
          <DeskCard className="p-5">
            <FieldLabel>Headline chit value (₹)</FieldLabel>
            <DeskInput value={pot} onChange={(event) => setPot(event.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" />
            <div className="mt-4">
              <FieldLabel>Installment per share (₹)</FieldLabel>
              <DeskInput value={normal} onChange={(event) => setNormal(event.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" />
              <p className="mt-1 text-xs text-slate-400">This is the amount the ledger collects for one share. A person with more shares is shown as shares × this amount.</p>
            </div>
          </DeskCard>
          <DeskCard className="p-4">
            <h2 className="text-sm font-semibold">Monthly plan</h2>
            <p className="mt-1 text-xs text-slate-500">Same prize setup as a new chit. Fill writes every month, then save it onto this running chit.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-500">Before withdrawal</span>
                <DeskInput value={normal} onChange={(event) => setNormal(event.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-500">After withdrawal</span>
                <DeskInput value={afterRate} onChange={(event) => setAfterRate(event.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-500">Starting amount</span>
                <DeskInput value={firstPrize} onChange={(event) => {
                  const value = event.target.value.replace(/[^\d]/g, '')
                  setFirstPrize(value)
                  const end = Number(lastPrize) || 0
                  setRise(String(Math.round((end - (Number(value) || 0)) / Math.max(plan.length - 1, 1))))
                }} inputMode="numeric" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-500">Ending amount</span>
                <DeskInput value={lastPrize} onChange={(event) => {
                  const value = event.target.value.replace(/[^\d]/g, '')
                  setLastPrize(value)
                  const startAmount = Number(firstPrize) || 0
                  setRise(String(Math.round(((Number(value) || 0) - startAmount) / Math.max(plan.length - 1, 1))))
                }} inputMode="numeric" />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-500">Rise each month</span>
                <DeskInput value={rise} onChange={(event) => {
                  const value = event.target.value.replace(/[^\d]/g, '')
                  setRise(value)
                  const startAmount = Number(firstPrize) || 0
                  setLastPrize(String(startAmount + (Number(value) || 0) * Math.max(plan.length - 1, 1)))
                }} inputMode="numeric" />
              </label>
              <GhostButton type="button" onClick={() => {
                const count = plan.length
                const matched = (shares || count) === (months || count)
                const amounts = matched
                  ? evenAmounts(Number(firstPrize) || 0, Number(lastPrize) || 0, count)
                  : steppedAmounts(Number(firstPrize) || 0, Number(rise) || 0, count)
                setPlan(plan.map((row, index) => ({ ...row, amount: String(amounts[index] ?? row.amount) })))
              }}>Fill</GhostButton>
            </div>
            <ul className="mt-3 max-h-40 space-y-1.5 overflow-auto">
              {plan.map((row, index) => (
                <li key={row.month} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-slate-500">M{index + 1}</span>
                  <DeskInput value={row.amount} onChange={(event) => setPlan((current) => current.map((item) => item.month === row.month ? { ...item, amount: event.target.value.replace(/[^\d]/g, '') } : item))} inputMode="numeric" />
                </li>
              ))}
              {plan.length === 0 && <li className="text-xs text-slate-400">No months on this chit yet.</li>}
            </ul>
            <GreenButton type="button" className="mt-3 w-full" disabled={planBusy || plan.length === 0} onClick={savePlan}>
              {planBusy ? 'Saving plan…' : 'Save monthly plan'}
            </GreenButton>
          </DeskCard>
          <DeskCard className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Prize total</h2>
                <p className="text-sm text-slate-500">{schedules.length} months on the ledger.</p>
              </div>
            </div>
            {meta.pot ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Mini label="Collected" value={formatMoney(collectedPlan)} />
                <Mini label="Prizes out" value={formatMoney(prizeTotal)} />
                <Mini label="You keep" value={formatMoney(marginForPlan(collectedPlan, prizeTotal))} accent />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Set a headline value to see what this chit collects, pays out, and keeps.</p>
            )}
          </DeskCard>
          <DeskCard className="flex items-center justify-between bg-rose-50 p-5">
            <div>
              <p className="text-sm font-semibold text-rose-500">Danger zone</p>
              <p className="text-sm text-slate-600">Archive this chit. Its payments stay in the ledger.</p>
            </div>
            <button
              type="button"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-rose-600 ring-1 ring-rose-200"
              onClick={async () => {
                if (!group) return
                await updateGroup(groupId, name.trim() || group.name, group.description ?? '', 'archived')
                navigate('/chits')
              }}
            >
              Archive
            </button>
          </DeskCard>
          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:left-[248px]">
            <div className="mx-auto flex max-w-[760px] gap-2">
              <DarkButton type="submit" disabled={busy} className="flex-1">{busy ? 'Saving…' : 'Update group'}</DarkButton>
              <GhostButton type="button" onClick={() => navigate('/chits')}>Back</GhostButton>
            </div>
          </div>
        </form>
      )}

      {tab === 'members' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Members</h2>
              <p className="text-sm text-slate-500">{activeSeats.length} members · {filled}/{shares || filled} shares filled</p>
            </div>
            <AddMember
              directory={directory.filter((member) => !seats.some((seat) => seat.memberId === member.id && seat.status === 'active'))}
              onAdd={async (memberId, personName) => {
                await addMembership({
                  groupId,
                  memberId,
                  joiningDate: start || new Date().toISOString().slice(0, 10),
                  initialAmount: 0,
                  notes: writeShares({ shares: 1, pool: [] }, ''),
                  scheduledMonth: null,
                  scheduledAmount: null,
                })
                if (personName) setDirectory(await listMembers())
                await reload()
              }}
              onCreate={async (personName) => {
                const id = await createMember(personName, '', '', '')
                await addMembership({
                  groupId,
                  memberId: id,
                  joiningDate: start || new Date().toISOString().slice(0, 10),
                  initialAmount: 0,
                  notes: writeShares({ shares: 1, pool: [] }, ''),
                  scheduledMonth: null,
                  scheduledAmount: null,
                })
                await reload()
              }}
            />
          </div>
          {activeSeats.map((seat, index) => (
            <DeskCard key={seat.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">#{index + 1} · {seat.name}</p>
                  <p className="text-sm text-emerald-700">Pays ≈ {formatMoney(seat.shares * rate)} / mo · wins up to {formatMoney(Number(pot) || 0)}</p>
                </div>
                <button type="button" onClick={() => leave(seat)} className="rounded-xl bg-rose-50 px-3 py-2 text-rose-500" aria-label="Remove member">⌫</button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <GhostButton type="button" onClick={() => changeShares(seat, seat.shares - 1)}>−</GhostButton>
                <span className="w-12 text-center font-semibold">{seat.shares}x</span>
                <GhostButton type="button" onClick={() => changeShares(seat, seat.shares + 1)}>+</GhostButton>
                <GhostButton type="button" className="ml-auto" onClick={() => setSplitFor(seat)}>Split into a pool</GhostButton>
              </div>
            </DeskCard>
          ))}
          <DarkButton type="button" className="w-full" onClick={() => navigate(`/chits/${groupId}`)}>Done</DarkButton>
        </div>
      )}

      {splitFor && (
        <SplitDialog
          seat={splitFor}
          onClose={() => setSplitFor(null)}
          onSave={async (pool) => {
            await updateMembership({
              membershipId: splitFor.id,
              status: splitFor.status,
              joiningDate: splitFor.joiningDate,
              initialAmount: splitFor.initialAmount,
              notes: writeShares({ shares: splitFor.shares, pool }, splitFor.notes),
              reason: 'Share split saved',
            })
            setSplitFor(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}

type MembershipQuery = {
  id: string
  member_id: string
  notes: string | null
  joining_date: string
  initial_amount: number | string
  status: string
  members: { name: string } | { name: string }[] | null
}

function Mini({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${accent ? 'bg-[#14915a] text-white' : 'bg-slate-50'}`}>
      <p className="text-[11px] font-semibold tracking-wide opacity-70">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  )
}

function AddMember({ directory, onAdd, onCreate }: { directory: MemberListItem[]; onAdd: (id: string, name?: string) => Promise<void>; onCreate: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!open) return <GhostButton type="button" onClick={() => setOpen(true)}>+ Add member</GhostButton>
  return (
    <DeskCard className="p-3">
      <select className="h-10 w-full rounded-xl border border-slate-200 px-2 text-sm" defaultValue="" onChange={(event) => { if (event.target.value) onAdd(event.target.value).catch((err: unknown) => setError(errorMessage(err))) }}>
        <option value="">Choose an existing member</option>
        {directory.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
      <div className="mt-2 flex gap-2">
        <DeskInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Or a new name" />
        <GreenButton type="button" onClick={() => onCreate(name.trim()).then(() => { setName(''); setOpen(false) }).catch((err: unknown) => setError(errorMessage(err)))}>Add</GreenButton>
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </DeskCard>
  )
}

function SplitDialog({ seat, onClose, onSave }: { seat: Seat; onClose: () => void; onSave: (pool: { name: string; part: number }[]) => Promise<void> }) {
  const existing = readShares(seat.notes).pool
  const [rows, setRows] = useState(existing.length >= 2 ? existing : [{ name: '', part: 0 }, { name: '', part: 0 }])
  const [error, setError] = useState<string | null>(null)
  const named = rows.filter((row) => row.name.trim())
  const total = named.reduce((sum, row) => sum + (Number(row.part) || 0), 0)
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">Split {seat.name}’s share</h2>
            <p className="text-sm text-slate-500">People who pay a part of these {seat.shares} shares. The chit still collects {seat.name} as one member.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-slate-200">×</button>
        </div>
        <div className="mt-4 space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_140px] gap-2">
              <DeskInput value={row.name} placeholder={`Person ${index + 1}`} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
              <DeskInput value={String(row.part || '')} inputMode="numeric" placeholder="₹" onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, part: Number(event.target.value.replace(/[^\d]/g, '')) || 0 } : item))} />
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows((current) => [...current, { name: '', part: 0 }])} className="mt-3 text-sm font-semibold text-emerald-700">+ Add person</button>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#111827] px-4 py-3 text-white">
          <span>{named.length} payers</span>
          <span>{formatMoney(total)}/mo</span>
        </div>
        {named.length < 2 && <p className="mt-2 text-sm text-slate-500">Add at least two people. One payer is just a normal member.</p>}
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <GhostButton type="button" onClick={onClose}>Cancel</GhostButton>
          <DarkButton
            type="button"
            disabled={named.length < 2}
            onClick={() => onSave(named).catch((err: unknown) => setError(errorMessage(err)))}
          >
            Save split
          </DarkButton>
        </div>
      </div>
    </div>
  )
}
