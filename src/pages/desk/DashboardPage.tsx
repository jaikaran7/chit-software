import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DeskCard } from '../../components/desk-ui'
import { isFutureMonth, monthChip, monthWindow, readChitMeta } from '../../lib/chitMeta'
import { PAYMENT_METHODS, asNumber, currentMonth, errorMessage, formatMoney, formatMonth, formatShortDate, methodLabel, shiftMonth, todayIso } from '../../lib/format'
import { getDashboard, listGroups, type GroupCard } from '../../services/groups'
import { isRecorded, listMoves, type MoneyMove } from '../../services/money'
import { getCollectionSheet, recordCollection, type CollectionRow } from '../../services/payments'
import { getPayoutSheet, recordPayout, type PayoutRow } from '../../services/withdrawals'

type SheetMonth = {
  id: string
  name: string
  collected: number
  paidOut: number
  pending: number
  prize: number | null
}

const dueLabel: Record<string, string> = {
  NOT_PAID: 'Not paid',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  ADVANCE: 'Advance',
  NOT_DUE: 'Not due',
}

const methodShort: Record<string, string> = {
  cash: 'Cash',
  gpay: 'GPay',
  qr: 'QR',
  bank_transfer: 'Bank',
  other: 'Other',
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [groups, setGroups] = useState<GroupCard[]>([])
  const [sheets, setSheets] = useState<SheetMonth[]>([])
  const [moves, setMoves] = useState<MoneyMove[]>([])
  const [error, setError] = useState<string | null>(null)
  const [totalIn, setTotalIn] = useState(0)
  const [totalOut, setTotalOut] = useState(0)
  const [totalsReady, setTotalsReady] = useState(false)
  const [groupsLoaded, setGroupsLoaded] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [payoutRows, setPayoutRows] = useState<PayoutRow[]>([])
  const [payId, setPayId] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payDate, setPayDate] = useState(todayIso())
  const [payBusy, setPayBusy] = useState(false)
  const [payLoading, setPayLoading] = useState(false)
  const [sheet, setSheet] = useState<CollectionRow[]>([])
  const [showPaid, setShowPaid] = useState(false)
  const [recordRow, setRecordRow] = useState<CollectionRow | null>(null)
  const [collectAmount, setCollectAmount] = useState('')
  const [collectMethod, setCollectMethod] = useState('cash')
  const [collectDate, setCollectDate] = useState(todayIso())
  const [collectRef, setCollectRef] = useState('')
  const [collectNotes, setCollectNotes] = useState('')
  const [collectBusy, setCollectBusy] = useState(false)
  const [collectError, setCollectError] = useState<string | null>(null)

  const month = params.get('month') || currentMonth()
  const chitId = params.get('chit') || ''
  const group = groups.find((item) => item.id === chitId) ?? [...groups].sort((a, b) => b.memberCount - a.memberCount)[0]
  const meta = readChitMeta(group?.description)
  const months = monthWindow(meta.start, meta.months, month)
  const monthIndex = Math.max(0, months.findIndex((item) => item.slice(0, 7) === month.slice(0, 7)))
  const windowStart = Math.min(Math.max(monthIndex - 3, 0), Math.max(months.length - 7, 0))
  const visibleMonths = months.slice(windowStart, windowStart + 7)
  const selected = sheets.find((item) => item.id === group?.id)
  const net = totalIn - totalOut
  const payable = payoutRows.filter((row) => row.withdrawal_status !== 'paid')
  const owing = sheet.filter((row) => row.status === 'NOT_PAID' || row.status === 'PARTIAL')
  const settled = sheet.filter((row) => row.status === 'PAID' || row.status === 'ADVANCE')
  const notPaidCount = sheet.filter((row) => row.status === 'NOT_PAID').length

  useEffect(() => {
    listGroups()
      .then((rows) => {
        const active = rows.filter((row) => row.status === 'active')
        setGroups(active.length ? active : rows)
      })
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setGroupsLoaded(true))
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
    if (groups.length === 0) return
    let cancelled = false
    setTotalsReady(false)
    Promise.all(groups.map((item) => getDashboard(item.id, month).catch(() => null)))
      .then((rows) => {
        if (cancelled) return
        const next = groups.map((item, index) => {
          const dash = rows[index]
          return {
            id: item.id,
            name: item.name,
            collected: asNumber(dash?.collected),
            paidOut: asNumber(dash?.actual_payout_total),
            pending: asNumber(dash?.pending),
            prize: dash?.scheduled_payout == null ? null : asNumber(dash.scheduled_payout),
          }
        })
        setSheets(next)
        setTotalIn(next.reduce((sum, row) => sum + row.collected, 0))
        setTotalOut(next.reduce((sum, row) => sum + row.paidOut, 0))
        setTotalsReady(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [groups, month])

  useEffect(() => {
    if (!group) return
    let cancelled = false
    listMoves(month)
      .then((activity) => {
        if (!cancelled) setMoves(activity.filter((move) => move.groupId === group.id && isRecorded(move.status)))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [group, month])

  useEffect(() => {
    setPayOpen(false)
    setPayId('')
    setPayoutRows([])
    setPayLoading(false)
    setRecordRow(null)
    setShowPaid(false)
  }, [group?.id, month])

  useEffect(() => {
    if (!group) return
    let cancelled = false
    getCollectionSheet(group.id, month)
      .then((rows) => {
        if (!cancelled) setSheet(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [group, month])

  function selectMonth(next: string) {
    const copy = new URLSearchParams(params)
    copy.set('month', next)
    if (group) copy.set('chit', group.id)
    setParams(copy)
  }

  function selectGroup(id: string) {
    setPayOpen(false)
    setPayoutRows([])
    setRecordRow(null)
    const copy = new URLSearchParams(params)
    copy.set('chit', id)
    copy.set('month', month)
    setParams(copy)
  }

  function openRecord(row: CollectionRow) {
    const dueNow = asNumber(row.outstanding) + asNumber(row.joining_outstanding)
    setPayOpen(false)
    setRecordRow(row)
    setCollectAmount(dueNow > 0 ? String(Math.round(dueNow)) : '')
    setCollectMethod('cash')
    setCollectDate(todayIso())
    setCollectRef('')
    setCollectNotes('')
    setCollectError(null)
  }

  async function submitCollect(event: FormEvent) {
    event.preventDefault()
    if (!recordRow || !(Number(collectAmount) > 0)) return
    setCollectBusy(true)
    setCollectError(null)
    try {
      const result = await recordCollection({
        membershipId: recordRow.membership_id,
        month,
        paymentDate: collectDate,
        amount: Number(collectAmount),
        method: collectMethod,
        reference: collectRef,
        notes: collectNotes,
      })
      setRecordRow(null)
      navigate(`/receipts/${result.receipt_id}`)
    } catch (err) {
      setCollectError(errorMessage(err))
    } finally {
      setCollectBusy(false)
    }
  }

  async function openPay() {
    if (!group) return
    setRecordRow(null)
    setPayOpen(true)
    setPayLoading(true)
    setError(null)
    try {
      const rows = await getPayoutSheet(group.id, month)
      setPayoutRows(rows)
      const open = rows.find((row) => row.withdrawal_status !== 'paid')
      if (open) choosePay(open, selected?.prize ?? null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPayLoading(false)
    }
  }

  function choosePay(row: PayoutRow, prize: number | null) {
    setPayId(row.membership_id)
    const own = row.scheduled_month?.slice(0, 7) === month.slice(0, 7) ? asNumber(row.scheduled_amount) : 0
    setPayAmount(String(own || prize || ''))
  }

  async function submitPay() {
    if (!payId || !(Number(payAmount) > 0)) return
    setPayBusy(true)
    setError(null)
    try {
      const row = payoutRows.find((item) => item.membership_id === payId)
      const scheduled = row?.scheduled_amount == null ? null : asNumber(row.scheduled_amount)
      const differs = scheduled != null && Math.abs(Number(payAmount) - scheduled) > 0.001
      const result = await recordPayout({
        membershipId: payId,
        actualMonth: month,
        actualAmount: Number(payAmount),
        paymentDate: payDate,
        method: payMethod,
        adjustmentReason: differs ? 'Paid from the dashboard' : '',
        notes: '',
      })
      setPayOpen(false)
      navigate(`/receipts/${result.receipt_id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPayBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <DeskCard className="p-3 sm:p-4">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-400">TOTAL IN</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-emerald-700 sm:text-2xl">{totalsReady ? formatMoney(totalIn) : '…'}</p>
          <p className="mt-1 text-[11px] text-slate-400">{formatMonth(month)} · all chits</p>
        </DeskCard>
        <DeskCard className="p-3 sm:p-4">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-400">TOTAL OUT</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-rose-600 sm:text-2xl">{totalsReady ? formatMoney(totalOut) : '…'}</p>
          <p className="mt-1 text-[11px] text-slate-400">{formatMonth(month)} · prizes paid</p>
        </DeskCard>
      </div>

      {groupsLoaded && !group && groups.length === 0 && (
        <DeskCard className="p-8 text-center">
          <h1 className="text-xl font-semibold">No chit yet</h1>
          <p className="mt-2 text-sm text-slate-500">Create a chit, add the members, and the month opens here.</p>
          <Link to="/chits/new" className="mt-5 inline-flex rounded-full bg-[#111827] px-5 py-3 text-sm font-semibold text-white">
            New chit
          </Link>
        </DeskCard>
      )}

      {group && (
        <>
          {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

          <DeskCard className="p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-400">NET THIS MONTH</p>
                <p className={`mt-1 text-xl font-semibold ${net >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{totalsReady ? formatMoney(net) : '…'}</p>
              </div>
              <p className="text-right text-[11px] text-slate-400">{sheets.length} chits</p>
            </div>
            <ul className="mt-3 divide-y divide-slate-100">
              {sheets.map((item) => {
                const width = Math.max(totalIn, totalOut, 1)
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => selectGroup(item.id)} className="w-full py-2.5 text-left">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className={`truncate font-medium ${item.id === group.id ? 'text-slate-900' : 'text-slate-500'}`}>{item.name}</span>
                        <span className="shrink-0 text-[11px] text-slate-400">still {formatMoney(item.pending)}</span>
                      </div>
                      <div className="mt-1.5 flex gap-1">
                        <span className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.max(8, (item.collected / width) * 100)}%` }} />
                        <span className="h-1.5 rounded-full bg-rose-400" style={{ width: `${Math.max(item.paidOut > 0 ? 8 : 0, (item.paidOut / width) * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        <span className="text-emerald-700">In {formatMoney(item.collected)}</span>
                        <span className="mx-1.5">·</span>
                        <span className="text-rose-600">Out {formatMoney(item.paidOut)}</span>
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          </DeskCard>

          {groups.length > 0 && (
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
              {groups.map((item) => {
                const active = item.id === group?.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectGroup(item.id)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${active ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'}`}
                  >
                    {item.name}
                  </button>
                )
              })}
            </div>
          )}

          <div className="mt-1.5 flex items-center gap-1">
            <button type="button" aria-label="Earlier months" onClick={() => selectMonth(shiftMonth(month, -1))} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs text-sky-600 hover:bg-sky-50">‹</button>
            <div className="flex flex-1 gap-1 overflow-x-auto">
              {visibleMonths.map((item, index) => {
                const chip = monthChip(item)
                const active = item.slice(0, 7) === month.slice(0, 7)
                const position = months.indexOf(item) + 1
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => selectMonth(item)}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${active ? 'bg-sky-700 text-white' : 'bg-sky-50 text-sky-800 ring-1 ring-sky-200'}`}
                  >
                    {chip.short}
                    <span className={`ml-1 ${active ? 'text-sky-200' : 'text-sky-500'}`}>M{position || index + 1}</span>
                  </button>
                )
              })}
            </div>
            <button type="button" aria-label="Later months" onClick={() => selectMonth(shiftMonth(month, 1))} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs text-sky-600 hover:bg-sky-50">›</button>
          </div>

          <DeskCard className="mt-3 p-3 sm:p-4">
            <div className="text-center">
              <p className="text-sm font-semibold">{owing.length} yet to pay</p>
              <p className="text-[11px] text-slate-400">{notPaidCount} not paid this month</p>
            </div>
            {owing.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Everyone on this chit is clear for {monthChip(month).short}.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {owing.map((row) => (
                  <DueLine key={row.membership_id} row={row} onRecord={() => openRecord(row)} />
                ))}
              </ul>
            )}
            {settled.length > 0 && (
              <button type="button" onClick={() => setShowPaid((value) => !value)} className="mt-3 block w-full text-center text-xs font-semibold text-indigo-600">
                {showPaid ? 'Hide paid' : `Show paid (${settled.length})`}
              </button>
            )}
            {showPaid && (
              <ul className="mt-1 divide-y divide-slate-100">
                {settled.map((row) => (
                  <DueLine key={row.membership_id} row={row} />
                ))}
              </ul>
            )}
            <button type="button" onClick={openPay} className="mt-3 w-full rounded-full py-2 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
              Pay a prize
            </button>
          </DeskCard>

          <DeskCard className="mt-3 p-4">
            <h2 className="text-center text-[10px] font-semibold tracking-[0.14em] text-slate-400">PAYMENTS</h2>
            {moves.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Nothing recorded for {monthChip(month).short} on this chit.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {moves.map((move) => (
                  <li key={`${move.kind}-${move.happenedOn}-${move.memberName}-${move.amount}`}>
                    <Link to={move.receiptId ? `/receipts/${move.receiptId}` : '/payments'} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{move.memberName}</p>
                        <p className="text-[11px] text-slate-400">{formatShortDate(move.happenedOn)} · {methodLabel(move.method)} · {move.kind === 'debit' ? 'Paid out' : 'Collected'}</p>
                      </div>
                      <p className={`shrink-0 text-sm font-semibold ${move.kind === 'debit' ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {move.kind === 'debit' ? '−' : '+'} {formatMoney(move.amount)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DeskCard>

          {recordRow && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40" onClick={() => setRecordRow(null)}>
              <form
                onSubmit={submitCollect}
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-[760px] rounded-t-3xl bg-white px-4 pt-3 shadow-xl"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
              >
                <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-slate-200" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{recordRow.member_name}</h2>
                    <p className="text-[11px] text-slate-400">
                      {isFutureMonth(month) ? 'Advance for this month. It shows as already paid on the earlier month.' : 'Goes to the oldest due on this chit.'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setRecordRow(null)} className="text-xs font-semibold text-slate-400">Close</button>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1 rounded-2xl bg-slate-50 px-1 py-2 text-center">
                  <MiniStat label="Due" value={recordRow.due} />
                  <MiniStat label="Paid" value={recordRow.paid} />
                  <MiniStat label="Left" value={recordRow.outstanding} />
                  <MiniStat label="Advance" value={recordRow.advance_credit} />
                </div>
                {asNumber(recordRow.joining_outstanding) > 0 && (
                  <p className="mt-1 text-center text-[11px] text-slate-400">Catch-up {formatMoney(recordRow.joining_outstanding)}</p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-500">
                    Date
                    <input type="date" value={collectDate} onChange={(event) => setCollectDate(event.target.value)} required className="mt-0.5 h-9 w-full rounded-xl border border-slate-200 px-2 text-sm" />
                  </label>
                  <label className="text-[11px] text-slate-500">
                    Amount
                    <input value={collectAmount} onChange={(event) => setCollectAmount(event.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" required className="mt-0.5 h-9 w-full rounded-xl border border-slate-200 px-2 text-sm" />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {PAYMENT_METHODS.map((item) => (
                    <button key={item.id} type="button" onClick={() => setCollectMethod(item.id)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${collectMethod === item.id ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {methodShort[item.id]}
                    </button>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-500">
                    Reference
                    <input value={collectRef} onChange={(event) => setCollectRef(event.target.value)} className="mt-0.5 h-9 w-full rounded-xl border border-slate-200 px-2 text-sm" />
                  </label>
                  <label className="text-[11px] text-slate-500">
                    Notes
                    <input value={collectNotes} onChange={(event) => setCollectNotes(event.target.value)} className="mt-0.5 h-9 w-full rounded-xl border border-slate-200 px-2 text-sm" />
                  </label>
                </div>
                {collectError && <p className="mt-2 text-xs text-rose-600">{collectError}</p>}
                <button type="submit" disabled={collectBusy || !(Number(collectAmount) > 0)} className="mt-2 w-full rounded-full bg-[#14915a] py-2 text-sm font-semibold text-white disabled:bg-slate-300">
                  {collectBusy ? 'Saving…' : 'Collect'}
                </button>
              </form>
            </div>
          )}

          {payOpen && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40" onClick={() => setPayOpen(false)}>
              <div
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-[760px] rounded-t-3xl bg-white px-4 pt-3 shadow-xl"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
              >
                <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-slate-200" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Pay a prize</h2>
                    <p className="text-[11px] text-slate-400">Only members of {group.name}.</p>
                  </div>
                  <button type="button" onClick={() => setPayOpen(false)} className="text-xs font-semibold text-slate-400">Close</button>
                </div>
                {payLoading ? (
                  <p className="py-4 text-sm text-slate-400">Loading members…</p>
                ) : payable.length === 0 ? (
                  <p className="py-4 text-sm text-slate-400">Everyone who can take a prize has already been paid.</p>
                ) : (
                  <>
                    <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                      {payable.map((row) => (
                        <button
                          key={row.membership_id}
                          type="button"
                          onClick={() => choosePay(row, selected?.prize ?? null)}
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${payId === row.membership_id ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800'}`}
                        >
                          {row.member_name}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="text-[11px] text-slate-500">
                        Amount
                        <input value={payAmount} onChange={(event) => setPayAmount(event.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" className="mt-0.5 h-9 w-full rounded-xl border border-slate-200 px-2 text-sm" />
                      </label>
                      <label className="text-[11px] text-slate-500">
                        Date
                        <input type="date" value={payDate} onChange={(event) => setPayDate(event.target.value)} className="mt-0.5 h-9 w-full rounded-xl border border-slate-200 px-2 text-sm" />
                      </label>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {PAYMENT_METHODS.map((item) => (
                        <button key={item.id} type="button" onClick={() => setPayMethod(item.id)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${payMethod === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {methodShort[item.id]}
                        </button>
                      ))}
                    </div>
                    {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
                    <button type="button" disabled={payBusy || !(Number(payAmount) > 0)} onClick={submitPay} className="mt-2 w-full rounded-full bg-slate-900 py-2 text-sm font-semibold text-white disabled:bg-slate-300">
                      {payBusy ? 'Paying…' : 'Pay'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DueLine({ row, onRecord }: { row: CollectionRow; onRecord?: () => void }) {
  const owed = asNumber(row.outstanding) + asNumber(row.joining_outstanding)
  const initial = row.member_name.trim().charAt(0).toUpperCase() || '?'
  return (
    <li className="flex items-center gap-2 py-2">
      <Link to={`/members/${row.member_id}`} className="flex min-w-0 flex-1 items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">{initial}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {row.member_name}{' '}
            <span className="text-[11px] font-medium text-slate-400">{dueLabel[row.status] ?? row.status}</span>
          </span>
          {row.mobile && <span className="block text-[11px] text-slate-400">{row.mobile}</span>}
        </span>
      </Link>
      <p className="shrink-0 text-sm font-semibold">{formatMoney(owed > 0 ? owed : row.paid)}</p>
      {onRecord && (
        <button type="button" onClick={onRecord} className="shrink-0 rounded-full bg-[#14915a] px-3 py-1.5 text-xs font-semibold text-white">
          Record
        </button>
      )}
    </li>
  )
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="text-[11px] font-semibold text-slate-800">{formatMoney(value)}</p>
    </div>
  )
}
