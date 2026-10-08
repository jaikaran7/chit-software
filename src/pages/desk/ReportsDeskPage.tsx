import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DeskCard } from '../../components/desk-ui'
import { chitTitle, readChitMeta } from '../../lib/chitMeta'
import { asNumber, currentMonth, errorMessage, formatMoney, formatMonth, methodLabel, shiftMonth, todayIso } from '../../lib/format'
import { listGroups, type GroupCard } from '../../services/groups'
import { isRecorded, listMovesInRange, type MoneyMove } from '../../services/money'
import { getCollectionSheet, type CollectionRow } from '../../services/payments'

type RangeKey = 'month' | 'last' | 'quarter' | 'fy' | '30'

const tabs = [
  { id: 'Money', label: 'Money in and out', hint: 'Collections and prizes between two dates' },
  { id: 'Unpaid', label: 'Defaulters', hint: 'Who missed last month' },
  { id: 'Payouts', label: 'Prizes paid', hint: 'Money you sent to members' },
  { id: 'People', label: 'By person', hint: 'What each member paid and received' },
] as const
type Tab = (typeof tabs)[number]['id']

export function ReportsDeskPage() {
  const [tab, setTab] = useState<Tab>('Money')
  const [rangeKey, setRangeKey] = useState<RangeKey>('month')
  const [from, setFrom] = useState(currentMonth())
  const [to, setTo] = useState(todayIso())
  const [chitId, setChitId] = useState('all')
  const [groups, setGroups] = useState<GroupCard[]>([])
  const [moves, setMoves] = useState<MoneyMove[]>([])
  const [dueMonth, setDueMonth] = useState(shiftMonth(currentMonth(), -1))
  const [defaulters, setDefaulters] = useState<{ group: string; row: CollectionRow }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    listGroups().then(setGroups).catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    const range = resolveRange(rangeKey)
    setFrom(range.from)
    setTo(range.to)
  }, [rangeKey])

  useEffect(() => {
    listMovesInRange(from, to)
      .then((rows) => setMoves(rows.filter((row) => isRecorded(row.status))))
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [from, to])

  useEffect(() => {
    listGroups()
      .then((rows) => Promise.all(rows.filter((row) => row.status === 'active').map(async (group) => {
        const sheet = await getCollectionSheet(group.id, dueMonth)
        return sheet
          .filter((row) => asNumber(row.outstanding) + asNumber(row.joining_outstanding) > 0)
          .map((row) => ({ group: group.name, row }))
      })))
      .then((groupsOfRows) => setDefaulters(groupsOfRows.flat()))
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [dueMonth])

  const scoped = moves.filter((move) => chitId === 'all' || move.groupId === chitId)
  const collected = scoped.filter((move) => move.kind === 'credit').reduce((total, move) => total + move.amount, 0)
  const paidOut = scoped.filter((move) => move.kind === 'debit').reduce((total, move) => total + move.amount, 0)
  const methods = useMemo(() => groupMethods(scoped.filter((move) => move.kind === 'credit')), [scoped])
  const contributors = useMemo(() => topPeople(scoped.filter((move) => move.kind === 'credit')), [scoped])
  const byMember = useMemo(() => memberTotals(scoped), [scoped])

  function download() {
    const lines = [
      'date,member,chit,kind,method,amount',
      ...scoped.map((move) => [move.happenedOn, move.memberName, move.groupName, move.kind, move.method, move.amount].join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `chit-report-${from}-to-${to}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function share() {
    const text = `Collected ${formatMoney(collected)} from ${from} to ${to}. Paid out ${formatMoney(paidOut)}. Net ${formatMoney(collected - paidOut)}.`
    if (navigator.share) {
      await navigator.share({ title: 'Chit report', text }).catch(() => undefined)
      return
    }
    await navigator.clipboard.writeText(text)
    setNotice('Report copied')
  }

  function whatsApp() {
    const text = `Chit report ${from} to ${to}: collected ${formatMoney(collected)}, paid out ${formatMoney(paidOut)}.`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="mx-auto max-w-[820px]">
      <div className="mb-4 grid grid-cols-2 gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-2xl px-3 py-2 text-left ${tab === item.id ? 'bg-[#111827] text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
          >
            <span className="block text-sm font-semibold">{item.label}</span>
            <span className={`mt-0.5 block text-[11px] ${tab === item.id ? 'text-slate-300' : 'text-slate-400'}`}>{item.hint}</span>
          </button>
        ))}
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      {notice && <p className="mb-3 text-sm text-emerald-700">{notice}</p>}

      {tab === 'Money' && (
        <>
          <DeskCard className="p-4">
            <h1 className="text-base font-semibold">Money moved between two dates</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <RangeChip active={rangeKey === 'month'} onClick={() => setRangeKey('month')} label="This month" />
              <RangeChip active={rangeKey === 'last'} onClick={() => setRangeKey('last')} label="Last month" />
              <RangeChip active={rangeKey === 'quarter'} onClick={() => setRangeKey('quarter')} label="This quarter" />
              <RangeChip active={rangeKey === 'fy'} onClick={() => setRangeKey('fy')} label="This FY" />
              <RangeChip active={rangeKey === '30'} onClick={() => setRangeKey('30')} label="30 days" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-500">
                From
                <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 h-10 w-full rounded-2xl border border-slate-200 px-3 text-sm" />
              </label>
              <label className="text-sm text-slate-500">
                To
                <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 h-10 w-full rounded-2xl border border-slate-200 px-3 text-sm" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setChitId('all')} className={`rounded-full px-4 py-2 text-sm font-semibold ${chitId === 'all' ? 'bg-[#111827] text-white' : 'bg-white ring-1 ring-slate-200'}`}>
                All chits
              </button>
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setChitId(group.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${chitId === group.id ? 'bg-[#111827] text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
                >
                  {chitTitle(group.name, readChitMeta(group.description), group.memberCount)}
                </button>
              ))}
            </div>
          </DeskCard>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <button type="button" onClick={share} className="rounded-full bg-white py-3 text-sm font-semibold ring-1 ring-slate-200">Share</button>
            <button type="button" onClick={whatsApp} className="rounded-full bg-[#14915a] py-3 text-sm font-semibold text-white">WhatsApp</button>
            <button type="button" onClick={download} className="rounded-full bg-white py-3 text-sm font-semibold ring-1 ring-slate-200">Download</button>
          </div>
          <DeskCard className="mt-4 bg-emerald-50/70 p-4">
            <p className="text-xs font-semibold text-emerald-800">Collected</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">{formatMoney(collected)}</p>
            <p className="mt-2 text-sm text-slate-500">{from} – {to} · {contributors.reduce((total, row) => total + row.count, 0)} payments</p>
          </DeskCard>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <DeskCard className="p-4">
              <p className="text-sm text-slate-400">Paid out</p>
              <p className="mt-1 text-xl font-semibold">{formatMoney(paidOut)}</p>
            </DeskCard>
            <DeskCard className="p-4">
              <p className="text-sm text-slate-400">Net flow</p>
              <p className="mt-1 text-xl font-semibold text-emerald-700">{formatMoney(collected - paidOut)}</p>
            </DeskCard>
          </div>
          <DeskCard className="mt-4 p-5">
            <h2 className="font-semibold">How members paid</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {methods.map((row) => (
                <span key={row.method} className="rounded-full bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
                  {methodLabel(row.method)} {formatMoney(row.amount)}
                </span>
              ))}
              {methods.length === 0 && <p className="text-sm text-slate-400">No collections in this period.</p>}
            </div>
          </DeskCard>
          <DeskCard className="mt-4 p-5">
            <h2 className="font-semibold">Top contributors</h2>
            <ol className="mt-3 space-y-3">
              {contributors.map((row, index) => (
                <li key={row.name} className="flex items-center justify-between">
                  <span><span className="mr-3 text-slate-400">{index + 1}</span>{row.name}<span className="ml-2 text-xs text-slate-400">{row.count} payment{row.count === 1 ? '' : 's'}</span></span>
                  <span className="font-semibold text-emerald-700">{formatMoney(row.amount)}</span>
                </li>
              ))}
              {contributors.length === 0 && <li className="text-sm text-slate-400">No collections in this period.</li>}
            </ol>
          </DeskCard>
        </>
      )}

      {tab === 'Unpaid' && (
        <DeskCard className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Defaulters</h2>
              <p className="text-sm text-slate-400">{formatMonth(dueMonth)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <MonthCalendar value={dueMonth} onChange={setDueMonth} />
              <button type="button" onClick={() => setDueMonth(shiftMonth(currentMonth(), -1))} className={`rounded-full px-3 py-1 text-xs font-semibold ${dueMonth.slice(0, 7) === shiftMonth(currentMonth(), -1).slice(0, 7) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                Last month
              </button>
              <button type="button" onClick={() => setDueMonth(currentMonth())} className={`rounded-full px-3 py-1 text-xs font-semibold ${dueMonth.slice(0, 7) === currentMonth().slice(0, 7) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                This month
              </button>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {defaulters.map((item) => (
              <li key={item.row.membership_id}>
                <Link to={`/members/${item.row.member_id}`} className="flex items-center justify-between py-3">
                  <span>
                    <span className="font-semibold">{item.row.member_name}</span>
                    <span className="ml-2 text-sm text-slate-400">{item.group}</span>
                  </span>
                  <span className="font-semibold text-rose-500">{formatMoney(asNumber(item.row.outstanding) + asNumber(item.row.joining_outstanding))}</span>
                </Link>
              </li>
            ))}
            {defaulters.length === 0 && <li className="py-6 text-sm text-slate-400">Nobody defaulted in {formatMonth(dueMonth)}.</li>}
          </ul>
        </DeskCard>
      )}
      {tab === 'Payouts' && (
        <DeskCard className="p-5">
          <h2 className="font-semibold">Payouts</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {scoped.filter((move) => move.kind === 'debit').map((move) => (
              <li key={`${move.happenedOn}-${move.memberName}-${move.amount}`} className="flex justify-between py-3">
                <span>{move.memberName}<span className="ml-2 text-sm text-slate-400">{move.happenedOn}</span></span>
                <span className="font-semibold">{formatMoney(move.amount)}</span>
              </li>
            ))}
            {scoped.filter((move) => move.kind === 'debit').length === 0 && <li className="py-6 text-sm text-slate-400">No payouts in this period.</li>}
          </ul>
        </DeskCard>
      )}
      {tab === 'People' && (
        <DeskCard className="p-5">
          <h2 className="font-semibold">By member</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {byMember.map((row) => (
              <li key={row.name} className="flex justify-between py-3">
                <span className="font-medium">{row.name}</span>
                <span className="text-sm text-slate-500">in {formatMoney(row.credit)} · out {formatMoney(row.debit)}</span>
              </li>
            ))}
          </ul>
        </DeskCard>
      )}
    </div>
  )
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function MonthCalendar({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(Number(value.slice(0, 4)))
  const now = currentMonth()
  const nowYear = Number(now.slice(0, 4))

  function choose(index: number) {
    const iso = `${year}-${String(index + 1).padStart(2, '0')}-01`
    if (iso.slice(0, 7) > now.slice(0, 7)) return
    onChange(iso)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Choose a month"
        onClick={() => {
          setYear(Number(value.slice(0, 4)))
          setOpen((current) => !current)
        }}
        className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-56 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-slate-200 sm:right-0 sm:left-auto">
          <div className="flex items-center justify-between">
            <button type="button" aria-label="Previous year" onClick={() => setYear((current) => current - 1)} className="grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100">‹</button>
            <span className="text-sm font-semibold">{year}</span>
            <button type="button" aria-label="Next year" disabled={year >= nowYear} onClick={() => setYear((current) => current + 1)} className="grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-30">›</button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {monthNames.map((label, index) => {
              const iso = `${year}-${String(index + 1).padStart(2, '0')}-01`
              const future = iso.slice(0, 7) > now.slice(0, 7)
              const active = iso.slice(0, 7) === value.slice(0, 7)
              return (
                <button
                  key={label}
                  type="button"
                  disabled={future}
                  onClick={() => choose(index)}
                  className={`rounded-full py-1.5 text-xs font-semibold ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'} disabled:text-slate-300`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function RangeChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-[#111827] text-white' : 'bg-slate-100 text-slate-600'}`}>
      {label}
    </button>
  )
}

function resolveRange(key: RangeKey): { from: string; to: string } {
  const today = todayIso()
  const month = currentMonth()
  if (key === 'month') return { from: month, to: today }
  if (key === 'last') {
    const start = shiftMonth(month, -1)
    return { from: start, to: endOfMonth(start) }
  }
  if (key === '30') {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    return { from: date.toISOString().slice(0, 10), to: today }
  }
  if (key === 'quarter') {
    const now = new Date()
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    return { from: quarterStart.toISOString().slice(0, 10), to: today }
  }
  const now = new Date()
  const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return { from: `${fyYear}-04-01`, to: today }
}

function endOfMonth(iso: string): string {
  const [year, month] = iso.slice(0, 7).split('-').map(Number)
  const last = new Date(year, month, 0).getDate()
  return `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}`
}

function groupMethods(moves: MoneyMove[]) {
  const map = new Map<string, number>()
  for (const move of moves) map.set(move.method, (map.get(move.method) ?? 0) + move.amount)
  return [...map.entries()].map(([method, amount]) => ({ method, amount }))
}

function topPeople(moves: MoneyMove[]) {
  const map = new Map<string, { amount: number; count: number }>()
  for (const move of moves) {
    const current = map.get(move.memberName) ?? { amount: 0, count: 0 }
    current.amount += move.amount
    current.count += 1
    map.set(move.memberName, current)
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)
}

function memberTotals(moves: MoneyMove[]) {
  const map = new Map<string, { credit: number; debit: number }>()
  for (const move of moves) {
    const current = map.get(move.memberName) ?? { credit: 0, debit: 0 }
    if (move.kind === 'credit') current.credit += move.amount
    else current.debit += move.amount
    map.set(move.memberName, current)
  }
  return [...map.entries()].map(([name, value]) => ({ name, ...value }))
}
