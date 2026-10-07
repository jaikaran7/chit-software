import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Banner, Button, Card, Field, Header, MethodPicker, Money, MonthBar, StatusPill, controlClass } from '../components/ui'
import { asNumber, currentMonth, errorMessage, formatMoney, formatMonth, todayIso } from '../lib/format'
import { getDashboard, listGroups, type GroupCard } from '../services/groups'
import { getPayoutSheet, recordPayout, type PayoutRow } from '../services/withdrawals'
import { supabase } from '../lib/supabase'

export function SendPage() {
  const { membershipId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const month = params.get('month') || currentMonth()
  const groupId = params.get('group') || ''
  const [groups, setGroups] = useState<GroupCard[]>([])
  const [rows, setRows] = useState<PayoutRow[]>([])
  const [scheduleAmount, setScheduleAmount] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [actualAmount, setActualAmount] = useState('')
  const [method, setMethod] = useState('bank_transfer')
  const [paymentDate, setPaymentDate] = useState(todayIso())
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listGroups().then(setGroups).catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    if (groupId || !membershipId) return
    supabase
      .from('group_memberships')
      .select('group_id')
      .eq('id', membershipId)
      .maybeSingle()
      .then(({ data, error: lookupError }) => {
        if (lookupError) setError(lookupError.message)
        if (data?.group_id) {
          const copy = new URLSearchParams(params)
          copy.set('group', data.group_id)
          if (!copy.get('month')) copy.set('month', month)
          setParams(copy, { replace: true })
        }
      })
  }, [groupId, membershipId, month, params, setParams])

  useEffect(() => {
    if (!groupId) return
    Promise.all([getPayoutSheet(groupId, month), getDashboard(groupId, month)])
      .then(([sheet, dash]) => {
        setRows(sheet)
        setScheduleAmount(dash.scheduled_payout == null ? null : asNumber(dash.scheduled_payout))
      })
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [groupId, month])

  function setMonth(next: string) {
    const copy = new URLSearchParams(params)
    copy.set('month', next)
    setParams(copy, { replace: true })
  }
  function setGroup(next: string) {
    const copy = new URLSearchParams(params)
    copy.set('group', next)
    copy.set('month', month)
    setParams(copy, { replace: true })
  }

  const selected = rows.find((row) => row.membership_id === membershipId) ?? null
  const scheduled = selected?.scheduled_amount == null ? null : asNumber(selected.scheduled_amount)
  const differs = scheduled != null && actualAmount !== '' && Math.abs(Number(actualAmount) - scheduled) > 0.001

  useEffect(() => {
    if (selected?.scheduled_amount != null && actualAmount === '') setActualAmount(String(asNumber(selected.scheduled_amount)))
  }, [selected, actualAmount])

  const sent = rows.filter((row) => row.actual_month?.slice(0, 7) === month.slice(0, 7) && row.withdrawal_status === 'paid')
  const planned = rows.filter((row) => row.scheduled_month?.slice(0, 7) === month.slice(0, 7) && row.withdrawal_status !== 'paid')
  const others = rows.filter((row) => row.withdrawal_status !== 'paid' && row.scheduled_month?.slice(0, 7) !== month.slice(0, 7))
  const outgoing = useMemo(() => sent.reduce((sum, row) => sum + asNumber(row.actual_amount), 0), [sent])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!membershipId) return
    setBusy(true)
    setError(null)
    try {
      const result = await recordPayout({
        membershipId,
        actualMonth: month,
        actualAmount: Number(actualAmount),
        paymentDate,
        method,
        adjustmentReason: reason,
        notes,
      })
      navigate(`/receipts/${result.receipt_id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!groupId) {
    return (
      <div>
        <Header title="Send payment" subtitle="Choose the group. The month’s schedule is not moved." />
        <div className="space-y-2">
          {groups.filter((group) => group.status === 'active').map((group) => (
            <button key={group.id} type="button" className="w-full text-left" onClick={() => setGroup(group.id)}>
              <Card><h2 className="font-display text-2xl">{group.name}</h2></Card>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (membershipId && selected) {
    return (
      <form onSubmit={onSubmit} className="space-y-3">
        <Header title={selected.member_name} subtitle="Paying this candidate does not change another month’s schedule." />
        <Card>
          <p className="text-sm text-muted">Scheduled month</p>
          <p className="font-semibold">{formatMonth(selected.scheduled_month)}</p>
          <p className="mt-2 text-sm text-muted">Scheduled payout</p>
          <p className="font-display text-3xl">{scheduled == null ? 'Not set' : formatMoney(scheduled)}</p>
        </Card>
        <Field label="Actual payout"><input className={controlClass} inputMode="decimal" value={actualAmount} onChange={(event) => setActualAmount(event.target.value)} required /></Field>
        {differs && (
          <Field label="Reason the actual payout differs">
            <input className={controlClass} value={reason} onChange={(event) => setReason(event.target.value)} required />
          </Field>
        )}
        <Field label="Payment date"><input className={controlClass} type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required /></Field>
        <Field label="Payment method"><MethodPicker value={method} onChange={setMethod} /></Field>
        <Field label="Notes"><input className={controlClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        {error && <Banner>{error}</Banner>}
        <Button type="submit" tone="clay" disabled={busy || selected.withdrawal_status === 'paid'}>{selected.withdrawal_status === 'paid' ? 'Already sent' : busy ? 'Sending…' : 'Confirm payout'}</Button>
      </form>
    )
  }

  const pool = showAll ? others.filter((row) => row.member_name.toLowerCase().includes(query.trim().toLowerCase())) : []

  return (
    <div>
      <Header title="Send payment" subtitle="Several members can withdraw in the same month. The schedule row stays where it is." />
      <MonthBar month={month} onChange={setMonth} />
      <Card className="mb-3">
        <p className="text-sm text-muted">Group schedule for {formatMonth(month)}</p>
        <p className="font-display text-3xl">{scheduleAmount == null ? 'No schedule row' : formatMoney(scheduleAmount)}</p>
        <p className="mt-2 text-sm">Sent so far <Money value={outgoing} /> · {sent.length} withdrawals</p>
      </Card>
      <Section title="Planned this month" rows={planned} onOpen={(id) => navigate(`/send/${id}?group=${groupId}&month=${month}`)} />
      <Section title="Already sent" rows={sent} onOpen={() => undefined} sent />
      <button type="button" className="mt-3 text-sm font-semibold text-grove" onClick={() => setShowAll((value) => !value)}>
        {showAll ? 'Hide other candidates' : 'Add another candidate'}
      </button>
      {showAll && (
        <div className="mt-3">
          <input className={`${controlClass} mb-2`} placeholder="Search member" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Section title="Other members" rows={pool} onOpen={(id) => navigate(`/send/${id}?group=${groupId}&month=${month}`)} />
        </div>
      )}
      {error && <p className="mt-3 text-sm text-clay">{error}</p>}
    </div>
  )
}

function Section({ title, rows, onOpen, sent = false }: { title: string; rows: PayoutRow[]; onOpen: (id: string) => void; sent?: boolean }) {
  if (rows.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {rows.map((row) => (
        <button key={row.membership_id} type="button" className="w-full text-left" onClick={() => onOpen(row.membership_id)} disabled={sent}>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{row.member_name}</h3>
                <p className="text-sm text-muted">Scheduled {formatMonth(row.scheduled_month)} · <Money value={row.scheduled_amount ?? 0} /></p>
                <p className="text-sm text-muted">Actual {formatMonth(row.actual_month)} · <Money value={row.actual_amount ?? 0} /></p>
              </div>
              <StatusPill status={row.withdrawal_status === 'paid' ? 'withdrawn' : row.scheduled_month ? 'scheduled' : 'none'} />
            </div>
          </Card>
        </button>
      ))}
    </div>
  )
}
