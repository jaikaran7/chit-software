import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, Header, Money, MonthBar } from '../components/ui'
import { asNumber, currentMonth, errorMessage, formatMoney } from '../lib/format'
import { getDashboard, type Dashboard } from '../services/groups'

export function GroupPage() {
  const { groupId = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const month = params.get('month') || currentMonth()
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDashboard(groupId, month).then(setDash).catch((err: unknown) => setError(errorMessage(err)))
  }, [groupId, month])

  function setMonth(next: string) {
    const copy = new URLSearchParams(params)
    copy.set('month', next)
    setParams(copy, { replace: true })
  }

  return (
    <div>
      <Header
        title={dash?.group_name ?? 'Group'}
        subtitle={
          dash?.normal_installment
            ? `${formatMoney(dash.normal_installment)} normal · ${formatMoney(dash.post_withdrawal_installment)} after withdrawal`
            : 'Loading scheme'
        }
        action={<Link to={`/groups/${groupId}/edit`} className="pt-1 text-sm font-semibold text-grove">Edit</Link>}
      />
      <MonthBar month={month} onChange={setMonth} />
      {error && <p className="mb-3 text-sm text-clay">{error}</p>}
      {dash && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Members" value={String(dash.member_count)} />
            <Stat label="Expected" value={formatMoney(dash.expected_collection)} />
            <Stat label="Collected" value={formatMoney(dash.collected)} />
            <Stat label="Pending" value={formatMoney(dash.pending)} />
            <Stat label="Partial" value={String(dash.partial_count)} />
            <Stat label="Advance" value={formatMoney(dash.advance)} />
          </div>
          <Card className="mt-3">
            <p className="text-sm text-muted">Payouts this month</p>
            <p className="mt-1 text-sm">Schedule <Money value={dash.scheduled_payout ?? 0} muted={!dash.scheduled_payout} /></p>
            <p className="text-sm">Sent <Money value={dash.actual_payout_total} /></p>
            <p className="mt-1 text-sm text-muted">{dash.actual_withdrawal_count} actual withdrawals</p>
            {asNumber(dash.joining_outstanding) > 0 && (
              <p className="mt-2 text-sm text-gold">Catch-up still open: {formatMoney(dash.joining_outstanding)}</p>
            )}
          </Card>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to={`/collect?group=${groupId}&month=${month}`} className="rounded-2xl bg-white py-3 text-center text-sm font-semibold ring-1 ring-line">Member list</Link>
            <Link to={`/groups/${groupId}/join`} className="rounded-2xl bg-white py-3 text-center text-sm font-semibold ring-1 ring-line">Add member</Link>
          </div>
        </>
      )}
      <div className="fixed bottom-20 left-1/2 z-10 w-full max-w-[430px] -translate-x-1/2 space-y-2 px-4">
        <Button onClick={() => navigate(`/collect?group=${groupId}&month=${month}`)}>Collect payment</Button>
        <Button tone="clay" onClick={() => navigate(`/send?group=${groupId}&month=${month}`)}>Send payment</Button>
      </div>
      <div className="h-32" />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 font-display text-2xl leading-none">{value}</p>
    </Card>
  )
}
