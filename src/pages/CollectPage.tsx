import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Banner, Button, Card, Field, Header, MethodPicker, Money, MonthBar, StatusPill, controlClass } from '../components/ui'
import { isFutureMonth } from '../lib/chitMeta'
import { asNumber, currentMonth, errorMessage, todayIso } from '../lib/format'
import { listGroups, type GroupCard } from '../services/groups'
import { getCollectionSheet, recordCollection, type CollectionRow } from '../services/payments'
import { supabase } from '../lib/supabase'

export function CollectPage() {
  const { membershipId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const month = params.get('month') || currentMonth()
  const groupId = params.get('group') || ''
  const [groups, setGroups] = useState<GroupCard[]>([])
  const [rows, setRows] = useState<CollectionRow[]>([])
  const [query, setQuery] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [paymentDate, setPaymentDate] = useState(todayIso())
  const [reference, setReference] = useState('')
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
    if (!groupId || membershipId) return
    getCollectionSheet(groupId, month).then(setRows).catch((err: unknown) => setError(errorMessage(err)))
  }, [groupId, month, membershipId])

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

  useEffect(() => {
    if (!membershipId || !groupId) return
    getCollectionSheet(groupId, month)
      .then((sheet) => {
        setRows(sheet)
        const row = sheet.find((item) => item.membership_id === membershipId)
        if (row) {
          const dueNow = asNumber(row.outstanding) + asNumber(row.joining_outstanding)
          setAmount(dueNow > 0 ? String(dueNow) : '')
        }
      })
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [membershipId, groupId, month])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!membershipId) return
    setBusy(true)
    setError(null)
    try {
      const result = await recordCollection({
        membershipId,
        month,
        paymentDate,
        amount: Number(amount),
        method,
        reference,
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
        <Header title="Collect payment" subtitle="Choose the group first." />
        <div className="space-y-2">
          {groups.filter((group) => group.status === 'active').map((group) => (
            <button key={group.id} type="button" onClick={() => setGroup(group.id)} className="w-full">
              <Card><h2 className="font-display text-2xl">{group.name}</h2></Card>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (membershipId) {
    return (
      <form onSubmit={onSubmit} className="space-y-3">
        <Header
          title={selected?.member_name ?? 'Collect'}
          subtitle={isFutureMonth(month)
            ? 'This month has not opened yet. The amount is an advance for this month, and the earlier month shows it as already paid.'
            : 'The payment is allocated to the oldest outstanding due in this group only.'}
        />
        <MonthBar month={month} onChange={setMonth} />
        {selected && (
          <Card>
            <div className="flex items-center justify-between"><p>Due</p><Money value={selected.due} /></div>
            <div className="flex items-center justify-between"><p>Paid</p><Money value={selected.paid} /></div>
            <div className="flex items-center justify-between"><p>Outstanding</p><Money value={selected.outstanding} /></div>
            <div className="flex items-center justify-between"><p>Advance</p><Money value={selected.advance_credit} /></div>
            {asNumber(selected.joining_outstanding) > 0 && (
              <div className="flex items-center justify-between"><p>Catch-up</p><Money value={selected.joining_outstanding} /></div>
            )}
            <div className="mt-2"><StatusPill status={selected.status} /></div>
          </Card>
        )}
        <Field label="Payment date"><input className={controlClass} type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required /></Field>
        <Field label="Amount received"><input className={controlClass} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field>
        <Field label="Payment method"><MethodPicker value={method} onChange={setMethod} /></Field>
        <Field label="Reference number"><input className={controlClass} value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
        <Field label="Notes"><input className={controlClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        {error && <Banner>{error}</Banner>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Collect payment'}</Button>
      </form>
    )
  }

  const visible = rows.filter((row) => row.member_name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div>
      <Header title="Collect payment" subtitle="Search the member, then record what they paid." />
      <MonthBar month={month} onChange={setMonth} />
      <input className={`${controlClass} mb-3`} placeholder="Search member" value={query} onChange={(event) => setQuery(event.target.value)} />
      {error && <p className="mb-3 text-sm text-clay">{error}</p>}
      <div className="space-y-2">
        {visible.map((row) => (
          <button key={row.membership_id} type="button" className="w-full text-left" onClick={() => navigate(`/collect/${row.membership_id}?group=${groupId}&month=${month}`)}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{row.member_name}</h2>
                  <p className="text-sm text-muted">Due <Money value={row.due} /> · Paid <Money value={row.paid} /></p>
                  <p className="text-sm text-muted">Outstanding <Money value={row.outstanding} /> · Advance <Money value={row.advance_credit} /></p>
                </div>
                <StatusPill status={row.status} />
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  )
}
