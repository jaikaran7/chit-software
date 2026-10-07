import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Banner, Header, Kpi, controlClass } from '../components/ui'
import { PAYMENT_METHODS, currentMonth, errorMessage, formatMoney, formatMonth, formatShortDate, methodLabel, shiftMonth } from '../lib/format'
import { isRecorded, loadMonthMoney, sumMoves, type MonthMoney, type MoneyMove } from '../services/money'

export function PaymentsPage() {
  const today = currentMonth()
  const [month, setMonth] = useState(today)
  const [groupId, setGroupId] = useState('')
  const [kind, setKind] = useState<'all' | 'credit' | 'debit'>('all')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState<'recorded' | 'voided' | 'all'>('recorded')
  const [data, setData] = useState<MonthMoney | null>(null)
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loading = loadedMonth !== month

  useEffect(() => {
    let cancelled = false
    loadMonthMoney(month)
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(null)
        setLoadedMonth(month)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(errorMessage(err))
        setData(null)
        setLoadedMonth(month)
      })
    return () => {
      cancelled = true
    }
  }, [month])

  const groups = data?.groups ?? []
  const activeIds = new Set(groups.filter((group) => group.status === 'active').map((group) => group.id))
  const credit = data ? sumMoves(data.moves, 'credit', groupId) : 0
  const debit = data ? sumMoves(data.moves, 'debit', groupId) : 0
  const pending = (data?.pendingByGroup ?? []).reduce((total, row) => {
    if (groupId) return row.id === groupId ? total + row.pending : total
    return activeIds.has(row.id) ? total + row.pending : total
  }, 0)

  const breakdown = groups
    .filter((group) => group.status === 'active' || data?.moves.some((move) => move.groupId === group.id))
    .map((group) => ({
      id: group.id,
      name: group.name,
      credit: data ? sumMoves(data.moves, 'credit', group.id) : 0,
      debit: data ? sumMoves(data.moves, 'debit', group.id) : 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const visible = (data?.moves ?? []).filter((move) => matches(move, groupId, kind, method, status))

  return (
    <div>
      <Header title="Payments" />
      {error && <div className="mb-3"><Banner>{error}</Banner></div>}
      <div className="mb-4 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <FilterChip active={month === today} onClick={() => setMonth(today)}>This month</FilterChip>
          <FilterChip active={month === shiftMonth(today, -1)} onClick={() => setMonth(shiftMonth(today, -1))}>Last month</FilterChip>
        </div>
        <FieldSelect label="Month">
          <input className={controlClass} type="month" value={month.slice(0, 7)} onChange={(event) => event.target.value && setMonth(`${event.target.value}-01`)} />
        </FieldSelect>
        <FieldSelect label="Group">
          <select className={controlClass} value={groupId} onChange={(event) => setGroupId(event.target.value)}>
            <option value="">All groups</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </FieldSelect>
        <FieldSelect label="Type">
          <select className={controlClass} value={kind} onChange={(event) => setKind(event.target.value as 'all' | 'credit' | 'debit')}>
            <option value="all">All payments</option>
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
          </select>
        </FieldSelect>
        <details className="rounded-2xl bg-card px-4 py-3 ring-1 ring-line">
          <summary className="cursor-pointer text-sm font-semibold text-grove">Method and status</summary>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <FieldSelect label="Payment method">
              <select className={controlClass} value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="">All methods</option>
                {PAYMENT_METHODS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </FieldSelect>
            <FieldSelect label="Status">
              <select className={controlClass} value={status} onChange={(event) => setStatus(event.target.value as 'recorded' | 'voided' | 'all')}>
                <option value="recorded">Recorded</option>
                <option value="voided">Reversed</option>
                <option value="all">All</option>
              </select>
            </FieldSelect>
          </div>
        </details>
      </div>

      <h2 className="mb-2 font-display text-2xl">{formatMonth(month)}</h2>
      {loading ? (
        <p className="text-sm text-muted">Loading payments…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Total credit" value={formatMoney(credit)} tone="grove" />
            <Kpi label="Total debit" value={formatMoney(debit)} tone="clay" />
            <Kpi label="Net flow" value={formatMoney(credit - debit)} tone={credit - debit >= 0 ? 'grove' : 'clay'} />
            <Kpi label="Pending collection" value={formatMoney(pending)} />
          </div>

          {!groupId && breakdown.length > 0 && (
            <section className="mt-5">
              <h2 className="mb-2 font-display text-2xl">By group</h2>
              <div className="divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
                {breakdown.map((group) => (
                  <div key={group.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <p className="font-semibold">{group.name}</p>
                    <div className="text-right text-sm">
                      <p className="font-semibold text-grove">Credit {formatMoney(group.credit)}</p>
                      <p className="font-semibold text-clay">Debit {formatMoney(group.debit)}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <p className="font-semibold">Total</p>
                  <div className="text-right text-sm">
                    <p className="font-semibold text-grove">Credit {formatMoney(credit)}</p>
                    <p className="font-semibold text-clay">Debit {formatMoney(debit)}</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="mt-5">
            <h2 className="mb-2 font-display text-2xl">Transactions</h2>
            {visible.length === 0 ? (
              <p className="text-sm text-muted">No payments in this view.</p>
            ) : (
              <div className="divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
                {visible.map((move, index) => (
                  <Transaction key={`${move.kind}-${move.receiptId ?? index}-${move.createdAt}`} move={move} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function matches(move: MoneyMove, groupId: string, kind: string, method: string, status: string) {
  if (groupId && move.groupId !== groupId) return false
  if (kind !== 'all' && move.kind !== kind) return false
  if (method && move.method !== method) return false
  if (status === 'recorded' && !isRecorded(move.status)) return false
  if (status === 'voided' && move.status !== 'voided') return false
  return true
}

function Transaction({ move }: { move: MoneyMove }) {
  const positive = move.kind === 'credit'
  const body = (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div>
        <p className="font-semibold">{move.memberName}</p>
        <p className="text-sm text-muted">{move.groupName}</p>
        <p className="text-sm text-muted">{formatShortDate(move.happenedOn)}</p>
      </div>
      <div className="text-right">
        <p className={`font-semibold tabular-nums ${move.status === 'voided' ? 'text-muted' : positive ? 'text-grove' : 'text-clay'}`}>
          {positive ? '+' : '−'} {formatMoney(move.amount)}
        </p>
        <p className="text-sm text-muted">{move.kind === 'debit' ? `Payout · ${methodLabel(move.method)}` : methodLabel(move.method)}</p>
        {move.status === 'voided' && <p className="text-xs font-semibold text-clay">Reversed</p>}
      </div>
    </div>
  )
  if (!move.receiptId) return body
  return <Link to={`/receipts/${move.receiptId}`} className="block">{body}</Link>
}

function FieldSelect({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-12 rounded-2xl text-sm font-semibold ${active ? 'bg-grove text-white' : 'bg-card text-ink ring-1 ring-line'}`}
    >
      {children}
    </button>
  )
}
