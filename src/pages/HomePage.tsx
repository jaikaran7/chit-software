import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, Empty, Header, Kpi } from '../components/ui'
import { currentMonth, errorMessage, formatMoney, formatShortDate, greeting } from '../lib/format'
import { listMembers } from '../services/members'
import { isRecorded, loadMonthMoney, type MonthMoney } from '../services/money'
import { listRecentActivity, type ActivityItem } from '../services/receipts'

export function HomePage() {
  const navigate = useNavigate()
  const [money, setMoney] = useState<MonthMoney | null>(null)
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const [recent, setRecent] = useState<ActivityItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const month = currentMonth()
    Promise.all([loadMonthMoney(month), listMembers(), listRecentActivity(6)])
      .then(([monthMoney, members, activity]) => {
        setMoney(monthMoney)
        setMemberCount(members.length)
        setRecent(activity)
      })
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  const active = money?.groups.filter((group) => group.status === 'active') ?? []
  const activeIds = new Set(active.map((group) => group.id))
  const recorded = money?.moves.filter((move) => isRecorded(move.status) && activeIds.has(move.groupId)) ?? []
  const credit = recorded.filter((move) => move.kind === 'credit').reduce((total, move) => total + move.amount, 0)
  const debit = recorded.filter((move) => move.kind === 'debit').reduce((total, move) => total + move.amount, 0)
  const pending = (money?.pendingByGroup ?? []).reduce((total, row) => (activeIds.has(row.id) ? total + row.pending : total), 0)

  return (
    <div>
      <Header eyebrow={greeting()} title="Home" />
      {error && <p className="mb-3 text-sm text-clay">{error}</p>}
      <p className="mb-3 text-sm text-muted">
        {money ? `${active.length} ${active.length === 1 ? 'group' : 'groups'}` : '…'}
        {' · '}
        {memberCount == null ? '…' : `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`}
      </p>
      <h2 className="mb-2 font-display text-2xl">This month</h2>
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Credit" value={money ? formatMoney(credit) : '…'} tone="grove" />
        <Kpi label="Debit" value={money ? formatMoney(debit) : '…'} tone="clay" />
        <Kpi label="Pending" value={money ? formatMoney(pending) : '…'} />
        <Kpi label="Net" value={money ? formatMoney(credit - debit) : '…'} tone={!money || credit - debit >= 0 ? 'grove' : 'clay'} />
      </div>

      <div className="mb-2 mt-6 flex items-center justify-between">
        <h2 className="font-display text-2xl">Groups</h2>
        <Link to="/groups/new" className="text-sm font-semibold text-grove">Add group</Link>
      </div>
      {money && active.length === 0 ? (
        <Empty title="No groups yet" body="Add a group, set the monthly payout, and choose the members." />
      ) : (
        <div className="space-y-2">
          {active.map((group) => (
            <Link key={group.id} to={`/groups/${group.id}`} className="block">
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-2xl leading-none">{group.name}</h3>
                    <p className="mt-2 text-sm text-muted">{group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}</p>
                  </div>
                  {group.normalInstallment != null && group.postWithdrawalInstallment != null && (
                    <p className="text-right text-sm text-muted">
                      {formatMoney(group.normalInstallment)}
                      <span className="mx-1">/</span>
                      {formatMoney(group.postWithdrawalInstallment)}
                    </p>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <h2 className="mb-2 mt-6 font-display text-2xl">Recent</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted">Payments you collect or send will show up here.</p>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
          {recent.map((row) => (
            <Link key={row.receipt_id} to={`/receipts/${row.receipt_id}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-semibold">{row.member_name}</p>
                <p className="text-sm text-muted">{row.group_name} · {formatShortDate(row.happened_on)}</p>
              </div>
              <p className={`font-semibold tabular-nums ${row.kind === 'COLLECTION' ? 'text-grove' : 'text-clay'}`}>
                {row.kind === 'COLLECTION' ? '+' : '−'} {formatMoney(row.amount)}
              </p>
            </Link>
          ))}
        </div>
      )}

      <div className="fixed bottom-20 left-1/2 z-10 w-full max-w-[430px] -translate-x-1/2 space-y-2 px-4">
        <Button onClick={() => navigate('/collect')}>Collect payment</Button>
        <Button tone="clay" onClick={() => navigate('/send')}>Send payment</Button>
      </div>
      <div className="h-36" />
    </div>
  )
}
