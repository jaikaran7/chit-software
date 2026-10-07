import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Field, Header, Money, MonthBar, StatusPill, controlClass } from '../components/ui'
import { asNumber, currentMonth, errorMessage, formatMoney, formatMonth, methodLabel } from '../lib/format'
import { listGroups, type GroupCard } from '../services/groups'
import { getGroupReport, type GroupReport } from '../services/reports'

export function ReportsPage() {
  const [groups, setGroups] = useState<GroupCard[]>([])
  const [groupId, setGroupId] = useState('')
  const [month, setMonth] = useState(currentMonth())
  const [report, setReport] = useState<GroupReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listGroups().then((rows) => {
      setGroups(rows)
      if (!groupId && rows[0]) setGroupId(rows[0].id)
    }).catch((err: unknown) => setError(errorMessage(err)))
  }, [groupId])

  useEffect(() => {
    if (!groupId) return
    getGroupReport(groupId, month).then(setReport).catch((err: unknown) => setError(errorMessage(err)))
  }, [groupId, month])

  const dash = report?.dashboard

  return (
    <div className="space-y-3">
      <Header title="Reports" subtitle="Monthly collection, method split, and payouts for one group." />
      <Field label="Group">
        <select className={controlClass} value={groupId} onChange={(event) => setGroupId(event.target.value)}>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </Field>
      <MonthBar month={month} onChange={setMonth} />
      {error && <p className="text-sm text-clay">{error}</p>}
      {dash && (
        <Card>
          <p className="text-sm text-muted">{dash.member_count} members</p>
          <p className="mt-2 text-sm">Expected <Money value={dash.expected_collection} /></p>
          <p className="text-sm">Collected <Money value={dash.collected} /></p>
          <p className="text-sm">Pending <Money value={dash.pending} /></p>
          <p className="text-sm">Partial {dash.partial_count}</p>
          <p className="text-sm">Advance <Money value={dash.advance} /></p>
          <p className="text-sm">Payouts <Money value={dash.actual_payout_total} /> · {dash.actual_withdrawal_count}</p>
        </Card>
      )}
      <Card>
        <h2 className="font-display text-xl">How collections arrived</h2>
        {(report?.collection_methods ?? []).map((row) => (
          <p key={row.method} className="mt-2 text-sm">{methodLabel(row.method)} · {formatMoney(row.amount)} · {row.count}</p>
        ))}
        {(report?.collection_methods ?? []).length === 0 && <p className="mt-2 text-sm text-muted">No collections dated in this month.</p>}
      </Card>
      <Card>
        <h2 className="font-display text-xl">Payouts</h2>
        <div className="mt-2 space-y-3">
          {(report?.payouts ?? []).map((row) => (
            <div key={row.membership_id}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">{row.member_name}</p>
                <StatusPill status={row.withdrawal_status === 'paid' ? 'withdrawn' : 'scheduled'} />
              </div>
              <p className="text-sm text-muted">Scheduled {formatMonth(row.scheduled_month)} · {formatMoney(row.scheduled_amount)}</p>
              <p className="text-sm text-muted">Actual {formatMonth(row.actual_month)} · {formatMoney(row.actual_amount)}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="font-display text-xl">Member statement links</h2>
        <div className="mt-2 space-y-2">
          {(report?.members ?? []).map((row) => (
            <Link key={row.membership_id} to={`/memberships/${row.membership_id}`} className="block text-sm">
              {row.member_name} · due {formatMoney(row.due)} · out {formatMoney(row.outstanding)}
              {asNumber(row.advance_credit) > 0 ? ` · advance ${formatMoney(row.advance_credit)}` : ''}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}
