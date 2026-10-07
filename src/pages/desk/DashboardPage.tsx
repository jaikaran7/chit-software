import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar, DeskCard, avatarTone } from '../../components/desk-ui'
import {
  chitTitle,
  daysUntilMonthEnd,
  isFutureMonth,
  isPastMonth,
  monthChip,
  monthWindow,
  readChitMeta,
} from '../../lib/chitMeta'
import { asNumber, currentMonth, errorMessage, formatMoney, formatShortDate, methodLabel, shiftMonth } from '../../lib/format'
import { getDashboard, listGroups, type GroupCard } from '../../services/groups'
import { isRecorded, listMoves, type MoneyMove } from '../../services/money'
import { getCollectionSheet, recordCollection, type CollectionRow } from '../../services/payments'
import { listSchedules } from '../../services/schedules'

type Point = { month: string; collected: number }

export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const [groups, setGroups] = useState<GroupCard[]>([])
  const [sheet, setSheet] = useState<CollectionRow[]>([])
  const [moves, setMoves] = useState<MoneyMove[]>([])
  const [series, setSeries] = useState<Point[]>([])
  const [expected, setExpected] = useState(0)
  const [collected, setCollected] = useState(0)
  const [pending, setPending] = useState(0)
  const [prize, setPrize] = useState<number | null>(null)
  const [showPaid, setShowPaid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const month = params.get('month') || currentMonth()
  const chitId = params.get('chit') || ''
  const group = groups.find((item) => item.id === chitId) ?? [...groups].sort((a, b) => b.memberCount - a.memberCount)[0]
  const meta = readChitMeta(group?.description)
  const months = monthWindow(meta.start, meta.months, month)
  const monthIndex = Math.max(0, months.findIndex((item) => item.slice(0, 7) === month.slice(0, 7)))
  const windowStart = Math.min(Math.max(monthIndex - 3, 0), Math.max(months.length - 7, 0))
  const visibleMonths = months.slice(windowStart, windowStart + 7)
  const future = isFutureMonth(month)
  const unpaid = sheet.filter((row) => asNumber(row.outstanding) > 0)
  const paid = sheet.filter((row) => asNumber(row.outstanding) <= 0 && (asNumber(row.due) > 0 || asNumber(row.advance_credit) > 0))
  const advance = sheet.reduce((sum, row) => sum + asNumber(row.advance_credit), 0)
  const ratio = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0

  useEffect(() => {
    listGroups()
      .then((rows) => {
        const active = rows.filter((row) => row.status === 'active')
        setGroups(active.length ? active : rows)
      })
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    if (!group) return
    if (group.id !== chitId) {
      const next = new URLSearchParams(params)
      next.set('chit', group.id)
      setParams(next, { replace: true })
    }
  }, [group, chitId, params, setParams])

  useEffect(() => {
    if (!group) return
    let cancelled = false
    setLoaded(false)
    Promise.all([
      getDashboard(group.id, month),
      getCollectionSheet(group.id, month),
      listMoves(month),
      listSchedules(group.id),
    ])
      .then(([dash, rows, activity, schedules]) => {
        if (cancelled) return
        setExpected(asNumber(dash.expected_collection))
        setCollected(asNumber(dash.collected))
        setPending(asNumber(dash.pending))
        setSheet(rows)
        setMoves(activity.filter((move) => move.groupId === group.id && move.kind === 'credit' && isRecorded(move.status)))
        const scheduled = schedules.find((row) => row.month.slice(0, 7) === month.slice(0, 7))
        setPrize(scheduled ? asNumber(scheduled.scheduled_payout_amount) : null)
        setLoaded(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [group, month])

  const seriesKey = `${group?.id ?? ''}|${meta.start ?? ''}|${meta.months ?? ''}`
  useEffect(() => {
    if (!group) return
    let cancelled = false
    const history = monthWindow(meta.start, meta.months, currentMonth())
      .filter((item) => item.slice(0, 7) <= currentMonth().slice(0, 7))
      .slice(-8)
    Promise.all(history.map((item) => getDashboard(group.id, item)))
      .then((rows) => {
        if (!cancelled) setSeries(rows.map((row) => ({ month: String(row.month), collected: asNumber(row.collected) })))
      })
      .catch(() => {
        if (!cancelled) setSeries([])
      })
    return () => {
      cancelled = true
    }
  }, [seriesKey, group, meta.start, meta.months])

  function selectMonth(next: string) {
    const copy = new URLSearchParams(params)
    copy.set('month', next)
    if (group) copy.set('chit', group.id)
    setParams(copy)
  }

  async function markAllPaid() {
    if (!group || unpaid.length === 0) return
    setBusy(true)
    setError(null)
    try {
      for (const row of unpaid) {
        await recordCollection({
          membershipId: row.membership_id,
          month,
          paymentDate: new Date().toISOString().slice(0, 10),
          amount: asNumber(row.outstanding),
          method: 'cash',
          reference: '',
          notes: future ? 'Advance recorded from the dashboard' : 'Marked paid from the dashboard',
        })
      }
      selectMonth(month)
      const [dash, rows, activity] = await Promise.all([
        getDashboard(group.id, month),
        getCollectionSheet(group.id, month),
        listMoves(month),
      ])
      setExpected(asNumber(dash.expected_collection))
      setCollected(asNumber(dash.collected))
      setPending(asNumber(dash.pending))
      setSheet(rows)
      setMoves(activity.filter((move) => move.groupId === group.id && move.kind === 'credit' && isRecorded(move.status)))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const title = group ? chitTitle(group.name, meta, group.memberCount) : 'Chits'

  return (
    <div className="mx-auto max-w-[760px]">
      {!group && loaded === false && groups.length === 0 && (
        <DeskCard className="p-8 text-center">
          <h1 className="text-2xl font-semibold">No chit yet</h1>
          <p className="mt-2 text-sm text-slate-500">Create a chit, add the members, and the month opens here.</p>
          <Link to="/chits/new" className="mt-5 inline-flex rounded-full bg-[#111827] px-5 py-3 text-sm font-semibold text-white">
            New chit
          </Link>
        </DeskCard>
      )}
      {group && (
        <>
          <div className="mb-4 flex justify-center">
            <Link to="/chits" className="inline-flex items-center gap-2 rounded-full bg-[#111827] px-4 py-2 text-sm font-semibold text-white">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {title}
            </Link>
          </div>
          {future && (
            <div className="mb-3 flex items-center justify-between rounded-full bg-white px-4 py-2 text-sm shadow-sm ring-1 ring-slate-200">
              <p>
                <span className="font-semibold text-sky-700">Future month</span>
                <span className="text-slate-500"> · {monthChip(month).short} {month.slice(0, 4)} · a payment here is an advance</span>
              </p>
              <button type="button" onClick={() => selectMonth(currentMonth())} className="font-semibold text-emerald-700">
                Back to current
              </button>
            </div>
          )}
          <div className="mb-4 flex items-center gap-2">
            <button type="button" aria-label="Earlier months" onClick={() => selectMonth(shiftMonth(month, -1))} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-white">
              ‹
            </button>
            <div className="flex flex-1 gap-2 overflow-x-auto">
              {visibleMonths.map((item, index) => {
                const chip = monthChip(item)
                const active = item.slice(0, 7) === month.slice(0, 7)
                const position = months.indexOf(item) + 1
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => selectMonth(item)}
                    className={`min-w-[68px] rounded-full px-2.5 py-1.5 text-xs sm:min-w-[88px] sm:px-3 sm:py-2 sm:text-sm ${active ? 'bg-[#111827] text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}
                  >
                    <span className="block font-semibold">{chip.short} {chip.year}</span>
                    <span className={`block text-[11px] ${active ? 'text-slate-300' : 'text-slate-400'}`}>M{position || index + 1}</span>
                  </button>
                )
              })}
            </div>
            <button type="button" aria-label="Later months" onClick={() => selectMonth(shiftMonth(month, 1))} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-white">
              ›
            </button>
          </div>

          {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

          <DeskCard className="p-4 sm:p-6">
            <div className="flex items-start justify-between">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">COLLECTION PROGRESS</p>
              <div className="flex items-center gap-3 text-sm">
                <button type="button" disabled={unpaid.length === 0 || busy} onClick={markAllPaid} className="font-semibold text-emerald-700 disabled:text-slate-300">
                  {busy ? 'Saving…' : future ? 'Record all as advance' : 'Mark all paid'}
                </button>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-2xl font-semibold tracking-tight sm:text-4xl">{loaded ? formatMoney(collected) : '…'}</p>
                <p className="mt-1 text-xs font-semibold tracking-wide text-slate-400">COLLECTED</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold sm:text-3xl">
                  <span className="text-emerald-600">{paid.length}</span>
                  <span className="ml-2 text-slate-300">{sheet.length}</span>
                </p>
                <p className="text-xs text-slate-400">{unpaid.length} unpaid</p>
              </div>
            </div>
            <div className="mt-5 flex gap-8 text-sm">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-slate-400">TARGET</p>
                <p className="font-semibold">{formatMoney(expected)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-rose-400">PENDING</p>
                <p className="font-semibold text-rose-500">{formatMoney(pending)}</p>
              </div>
              {advance > 0 && (
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-sky-500">ADVANCE</p>
                  <p className="font-semibold text-sky-700">{formatMoney(advance)}</p>
                </div>
              )}
              {prize != null && (
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-slate-400">PRIZE THIS MONTH</p>
                  <p className="font-semibold">{formatMoney(prize)}</p>
                </div>
              )}
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${ratio}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <p><span className="mr-3 text-emerald-600">● Paid</span><span>○ Unpaid</span></p>
              <p>{daysUntilMonthEnd(month)}d left · {ratio}%</p>
            </div>
          </DeskCard>

          <DeskCard className="mt-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{unpaid.length} yet to pay</h2>
                <p className="text-xs text-slate-400">{unpaid.filter((row) => row.status === 'NOT_PAID').length} not paid this month</p>
              </div>
              {unpaid.length > 1 && !future && (
                <button
                  type="button"
                  onClick={() => remind(unpaid)}
                  className="rounded-full px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200"
                >
                  Remind all
                </button>
              )}
            </div>
            <ul className="mt-3 divide-y divide-slate-100">
              {unpaid.map((row) => (
                <DueRow key={row.membership_id} row={row} month={month} groupId={group.id} future={future} overdue={isPastMonth(month)} />
              ))}
              {unpaid.length === 0 && <li className="py-6 text-sm text-slate-400">Everyone due this month is paid.</li>}
            </ul>
            {paid.length > 0 && (
              <button type="button" onClick={() => setShowPaid((value) => !value)} className="mt-2 text-sm font-medium text-slate-400">
                {showPaid ? 'Hide paid' : `Show paid (${paid.length})`}
              </button>
            )}
            {showPaid && (
              <ul className="mt-2 divide-y divide-slate-100">
                {paid.map((row) => {
                  const settled = asNumber(row.paid)
                  const ahead = asNumber(row.advance_credit)
                  const advanceOnly = future || (row.status === 'ADVANCE' && settled === 0)
                  return (
                    <li key={row.membership_id} className="flex items-center justify-between gap-3 py-3">
                      <span className="font-medium">{row.member_name}</span>
                      <span className="text-right text-sm text-emerald-700">
                        {advanceOnly ? `${formatMoney(settled || ahead)} advance` : `${formatMoney(settled)} paid`}
                        {!advanceOnly && ahead > 0 && <span className="mt-0.5 block text-sky-700">{formatMoney(ahead)} advance</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </DeskCard>

          <DeskCard className="mt-4 p-5">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold tracking-[0.14em] text-slate-400">
              <span>COLLECTIONS</span>
              <span className="text-emerald-600">● COLLECTED</span>
            </div>
            <CollectionChart points={series} />
          </DeskCard>

          <DeskCard className="mt-4 p-5">
            <h2 className="text-center text-xs font-semibold tracking-[0.14em] text-slate-400">PAYMENTS</h2>
            {moves.length === 0 ? (
              <div className="py-8 text-center">
                <p className="font-semibold">No payments in this month</p>
                <p className="mt-1 text-sm text-slate-400">A recorded payment for {monthChip(month).short} shows up here.</p>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {moves.map((move) => (
                  <li key={`${move.happenedOn}-${move.memberName}-${move.amount}`}>
                    <Link to={move.receiptId ? `/receipts/${move.receiptId}` : '/payments'} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-semibold">{move.memberName}</p>
                        <p className="text-sm text-slate-400">{formatShortDate(move.happenedOn)} · {methodLabel(move.method)}</p>
                      </div>
                      <p className="font-semibold text-emerald-700">+ {formatMoney(move.amount)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DeskCard>
        </>
      )}
    </div>
  )
}

function DueRow({ row, month, groupId, future, overdue }: { row: CollectionRow; month: string; groupId: string; future: boolean; overdue: boolean }) {
  const label = overdue ? 'Overdue' : future ? 'Upcoming' : 'Not paid'
  const ahead = asNumber(row.advance_credit)
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={row.member_name} tone={avatarTone(row.member_name)} />
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {row.member_name} <span className={`text-xs ${overdue ? 'text-rose-500' : 'text-slate-400'}`}>{label}</span>
          </p>
          <p className="text-xs text-slate-400">{row.mobile || 'No phone'}</p>
          {ahead > 0 && <p className="text-xs font-medium text-sky-700">{formatMoney(ahead)} advance already paid</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <p className={`font-semibold ${overdue ? 'text-rose-500' : ''}`}>{formatMoney(row.outstanding)}</p>
        <Link
          to={`/collect/${row.membership_id}?month=${month}&group=${groupId}`}
          className="rounded-full bg-[#14915a] px-4 py-2 text-sm font-semibold text-white"
        >
          {future ? 'Advance' : 'Record'}
        </Link>
      </div>
    </li>
  )
}

function remind(rows: CollectionRow[]) {
  const names = rows.map((row) => row.member_name).join(', ')
  const text = `Payment reminder for ${names}.`
  const phone = rows.find((row) => row.mobile)?.mobile?.replace(/\D/g, '')
  const url = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

function CollectionChart({ points }: { points: Point[] }) {
  const path = useMemo(() => {
    if (points.length === 0) return ''
    const max = Math.max(...points.map((point) => point.collected), 1)
    const width = 640
    const height = 140
    return points
      .map((point, index) => {
        const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width
        const y = height - (point.collected / max) * (height - 16) - 8
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [points])

  if (points.length === 0) return <p className="py-8 text-center text-sm text-slate-400">Collections will draw here after the first payment.</p>

  return (
    <div>
      <svg viewBox="0 0 640 140" className="h-36 w-full">
        <path d={path} fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="flex justify-between text-[11px] text-slate-400">
        {points.map((point) => (
          <span key={point.month}>{monthChip(point.month).short}</span>
        ))}
      </div>
    </div>
  )
}
