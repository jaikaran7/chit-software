import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Banner, Button, Field, Header, Kpi, StatusPill, controlClass } from '../components/ui'
import { asNumber, currentMonth, errorMessage, formatMoney, formatMonth, formatShortDate, methodLabel } from '../lib/format'
import { getMembership, getStatement, assignScheduledWithdrawal, type StatementRow } from '../services/memberships'
import { listMembershipHistory, type MoneyMove } from '../services/money'
import { updateActualWithdrawal } from '../services/withdrawals'

type Membership = NonNullable<Awaited<ReturnType<typeof getMembership>>>

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    const first = value[0]
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null
  }
  return value as Record<string, unknown>
}

function moneyOrDash(value: unknown) {
  if (value == null || value === '') return '—'
  return formatMoney(value)
}

export function MembershipPage() {
  const { membershipId = '' } = useParams()
  const month = currentMonth()
  const [membership, setMembership] = useState<Membership | null>(null)
  const [rows, setRows] = useState<StatementRow[]>([])
  const [history, setHistory] = useState<MoneyMove[]>([])
  const [scheduledMonth, setScheduledMonth] = useState('')
  const [scheduledAmount, setScheduledAmount] = useState('')
  const [reason, setReason] = useState('')
  const [actualMonth, setActualMonth] = useState('')
  const [actualAmount, setActualAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [detail, statement, payments] = await Promise.all([
      getMembership(membershipId),
      getStatement(membershipId, month),
      listMembershipHistory(membershipId),
    ])
    setMembership(detail as Membership)
    setRows(statement)
    setHistory(payments)
    if (detail?.scheduled_withdrawal_month) setScheduledMonth(String(detail.scheduled_withdrawal_month).slice(0, 7))
    if (detail?.scheduled_payout_amount != null) setScheduledAmount(String(detail.scheduled_payout_amount))
    if (detail?.actual_withdrawal_month) setActualMonth(String(detail.actual_withdrawal_month).slice(0, 7))
    if (detail?.actual_payout_amount != null) setActualAmount(String(detail.actual_payout_amount))
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getMembership(membershipId),
      getStatement(membershipId, month),
      listMembershipHistory(membershipId),
    ])
      .then(([detail, statement, payments]) => {
        if (cancelled) return
        setMembership(detail as Membership)
        setRows(statement)
        setHistory(payments)
        if (detail?.scheduled_withdrawal_month) setScheduledMonth(String(detail.scheduled_withdrawal_month).slice(0, 7))
        if (detail?.scheduled_payout_amount != null) setScheduledAmount(String(detail.scheduled_payout_amount))
        if (detail?.actual_withdrawal_month) setActualMonth(String(detail.actual_withdrawal_month).slice(0, 7))
        if (detail?.actual_payout_amount != null) setActualAmount(String(detail.actual_payout_amount))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [membershipId, month])

  const group = asRecord(membership?.groups)
  const scheme = asRecord(group?.group_schemes)
  const member = asRecord(membership?.members)
  const current = rows.at(-1)

  async function saveSchedule(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await assignScheduledWithdrawal(
        membershipId,
        scheduledMonth ? `${scheduledMonth}-01` : null,
        scheduledAmount === '' ? null : Number(scheduledAmount),
        reason,
      )
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function saveActual(event: FormEvent) {
    event.preventDefault()
    if (!membership?.actual_withdrawal_month) return
    setError(null)
    try {
      const { data, error: lookupError } = await (await import('../lib/supabase')).supabase
        .from('withdrawal_transactions')
        .select('id')
        .eq('group_membership_id', membershipId)
        .eq('status', 'paid')
        .maybeSingle()
      if (lookupError) throw lookupError
      if (!data) throw new Error('No payout to correct')
      await updateActualWithdrawal(data.id, `${actualMonth}-01`, Number(actualAmount), reason)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <Header title={String(member?.name ?? 'Member')} subtitle={group?.name ? String(group.name) : undefined} />
      {scheme && (
        <p className="text-sm text-muted">
          {formatMoney(scheme.normal_installment)} normal · {formatMoney(scheme.post_withdrawal_installment)} after withdrawal
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Current due" value={current ? formatMoney(current.due) : '—'} />
        <Kpi label="Paid" value={current ? formatMoney(current.paid) : '—'} tone="grove" />
        <Kpi label="Outstanding" value={current ? formatMoney(current.outstanding) : '—'} tone="clay" />
        <Kpi label="Advance" value={current ? formatMoney(current.advance_credit) : '—'} />
      </div>
      {current && asNumber(current.joining_outstanding) > 0 && (
        <p className="text-sm text-gold">Catch-up left {formatMoney(current.joining_outstanding)}</p>
      )}
      {current && <StatusPill status={current.status} />}

      <section>
        <h2 className="mb-2 font-display text-2xl">Withdrawal</h2>
        <dl className="divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
          <Fact label="Scheduled month" value={formatMonth(membership?.scheduled_withdrawal_month ? String(membership.scheduled_withdrawal_month) : null)} />
          <Fact label="Actual withdrawal month" value={formatMonth(membership?.actual_withdrawal_month ? String(membership.actual_withdrawal_month) : null)} />
          <Fact label="Scheduled amount" value={moneyOrDash(membership?.scheduled_payout_amount)} />
          <Fact label="Actual amount" value={moneyOrDash(membership?.actual_payout_amount)} />
        </dl>
      </section>

      <section>
        <h2 className="mb-2 font-display text-2xl">Payment history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">No payments yet.</p>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
            {history.map((move, index) => {
              const row = (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-semibold">{formatShortDate(move.happenedOn)}</p>
                    <p className="text-sm text-muted">{move.kind === 'debit' ? `Payout · ${methodLabel(move.method)}` : methodLabel(move.method)}</p>
                  </div>
                  <p className={`font-semibold tabular-nums ${move.status === 'voided' ? 'text-muted' : move.kind === 'credit' ? 'text-grove' : 'text-clay'}`}>
                    {move.kind === 'credit' ? '+' : '−'} {formatMoney(move.amount)}
                  </p>
                </div>
              )
              return move.receiptId ? (
                <Link key={move.receiptId} to={`/receipts/${move.receiptId}`} className="block">{row}</Link>
              ) : (
                <div key={`${move.createdAt}-${index}`}>{row}</div>
              )
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Link to={`/collect/${membershipId}?month=${month}`} className="flex h-12 items-center justify-center rounded-2xl bg-grove font-semibold text-white">Collect</Link>
        <Link to={`/send/${membershipId}?month=${month}`} className="flex h-12 items-center justify-center rounded-2xl bg-clay font-semibold text-white">Send</Link>
      </div>

      <details className="rounded-3xl bg-card px-4 py-3 ring-1 ring-line">
        <summary className="cursor-pointer font-semibold">Month by month</summary>
        <div className="mt-3 space-y-3">
          {rows.map((row) => (
            <div key={row.month} className="border-t border-line pt-3 first:border-0 first:pt-0">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{formatMonth(row.month)}</p>
                <StatusPill status={row.status} />
              </div>
              <p className="text-sm text-muted">Due {formatMoney(row.due)} · Paid {formatMoney(row.paid)} · Outstanding {formatMoney(row.outstanding)} · Advance {formatMoney(row.advance_credit)}</p>
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-3xl bg-card px-4 py-3 ring-1 ring-line">
        <summary className="cursor-pointer font-semibold">Change scheduled withdrawal</summary>
        <form onSubmit={saveSchedule} className="mt-3 space-y-3">
          <Field label="Scheduled month"><input className={controlClass} type="month" value={scheduledMonth} onChange={(event) => setScheduledMonth(event.target.value)} /></Field>
          <Field label="Scheduled amount"><input className={controlClass} inputMode="decimal" value={scheduledAmount} onChange={(event) => setScheduledAmount(event.target.value)} /></Field>
          <Field label="Reason if this changes an existing schedule"><input className={controlClass} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
          <Button type="submit">Save schedule</Button>
        </form>
      </details>

      {membership?.actual_withdrawal_month && (
        <details className="rounded-3xl bg-card px-4 py-3 ring-1 ring-line">
          <summary className="cursor-pointer font-semibold">Correct actual withdrawal</summary>
          <form onSubmit={saveActual} className="mt-3 space-y-3">
            <p className="text-sm text-muted">The scheduled amount stays as it was. Future dues follow the actual month.</p>
            <Field label="Actual month"><input className={controlClass} type="month" value={actualMonth} onChange={(event) => setActualMonth(event.target.value)} required /></Field>
            <Field label="Actual amount"><input className={controlClass} inputMode="decimal" value={actualAmount} onChange={(event) => setActualAmount(event.target.value)} required /></Field>
            <Button type="submit" tone="ghost">Save correction</Button>
          </form>
        </details>
      )}
      {error && <Banner>{error}</Banner>}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  )
}
