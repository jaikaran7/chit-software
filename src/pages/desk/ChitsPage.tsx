import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DeskCard } from '../../components/desk-ui'
import { chitTitle, readChitMeta } from '../../lib/chitMeta'
import { asNumber, currentMonth, errorMessage, formatMoney, formatShortDate } from '../../lib/format'
import { getDashboard, listGroups, type GroupCard } from '../../services/groups'
import { getCollectionSheet } from '../../services/payments'

type CardModel = {
  group: GroupCard
  collected: number
  expected: number
  paid: number
  total: number
  monthLabel: string
}

export function ChitsPage() {
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [cards, setCards] = useState<CardModel[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const month = currentMonth()
    listGroups()
      .then(async (groups) => {
        const rows = await Promise.all(groups.map(async (group) => {
          const [dash, sheet] = await Promise.all([
            getDashboard(group.id, month),
            getCollectionSheet(group.id, month),
          ])
          const paid = sheet.filter((row) => asNumber(row.outstanding) <= 0 && asNumber(row.due) > 0).length
          return {
            group,
            collected: asNumber(dash.collected),
            expected: asNumber(dash.expected_collection),
            paid,
            total: sheet.length,
            monthLabel: new Date().toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
          }
        }))
        setCards(rows)
      })
      .catch((err: unknown) => setError(errorMessage(err)))
  }, [])

  const visible = cards.filter((card) => {
    const life = readChitMeta(card.group.description).life
    if (filter === 'all') return true
    return card.group.status === 'active' && life !== 'completed'
  })
  const collected = visible.reduce((total, card) => total + card.collected, 0)
  const still = visible.reduce((total, card) => total + Math.max(card.total - card.paid, 0), 0)

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-3xl">Chit Groups</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatMoney(collected)} collected this month
            {still > 0 ? ` · ${still} still to pay` : ''}
          </p>
        </div>
        <Link to="/chits/new" className="rounded-full bg-[#111827] px-4 py-2.5 text-sm font-semibold text-white">
          + New
        </Link>
      </div>
      <div className="mb-4 flex gap-2">
        <FilterChip active={filter === 'active'} onClick={() => setFilter('active')} label={`Active ${cards.filter((card) => card.group.status === 'active').length}`} />
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`All ${cards.length}`} />
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <div className="space-y-4">
        {visible.map((card) => {
          const meta = readChitMeta(card.group.description)
          const ratio = card.expected > 0 ? Math.min(100, (card.collected / card.expected) * 100) : 0
          return (
            <DeskCard key={card.group.id} className="overflow-hidden">
              <div className="p-4 md:p-6">
                <div className="flex items-start justify-between">
                  <p className="text-xs text-emerald-700">
                    <span className="mr-1">●</span>
                    {card.group.status === 'active' ? 'Active' : 'Archived'}
                  </p>
                  <Link to={`/chits/${card.group.id}`} className="text-slate-400" aria-label="Edit chit">✎</Link>
                </div>
                <h2 className="mt-2 text-center text-lg font-semibold">{chitTitle(card.group.name, meta, card.group.memberCount)}</h2>
                <p className="mt-2 text-center text-xl font-semibold tracking-tight">
                  {formatMoney(card.collected)}
                  <span className="text-sm font-medium text-slate-300"> / {formatMoney(card.expected)}</span>
                </p>
                <p className="text-center text-xs text-slate-400">collected this month · {card.monthLabel}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${ratio}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-slate-50 py-2">
                    <p className="text-base font-semibold">{card.group.memberCount}</p>
                    <p className="text-[11px] text-slate-400">Members</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 py-2">
                    <p className="text-base font-semibold">{meta.months ?? '—'}</p>
                    <p className="text-[11px] text-slate-400">Months</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 py-2">
                    <p className="text-base font-semibold">{card.paid}/{card.total}</p>
                    <p className="text-[11px] text-slate-400">Paid · month {monthNumber(meta.start)}</p>
                  </div>
                </div>
                {card.group.createdAt && (
                  <p className="mt-1 text-xs text-slate-400">Created {formatShortDate(card.group.createdAt.slice(0, 10))}</p>
                )}
              </div>
              <div className="grid grid-cols-2 border-t border-slate-100 text-sm font-semibold">
                <Link to={`/?chit=${card.group.id}`} className="py-3 text-center text-slate-600 hover:bg-slate-50">Dashboard</Link>
                <Link to={`/chits/new?from=${card.group.id}`} className="border-l border-slate-100 py-3 text-center text-slate-600 hover:bg-slate-50">Duplicate</Link>
              </div>
            </DeskCard>
          )
        })}
        {visible.length === 0 && !error && (
          <DeskCard className="p-8 text-center text-sm text-slate-500">No chits in this filter.</DeskCard>
        )}
      </div>
    </div>
  )
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-[#111827] text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}
    >
      {label}
    </button>
  )
}

function monthNumber(start: string | null): string {
  if (!start) return 'this month'
  const [year, month] = start.slice(0, 7).split('-').map(Number)
  const now = new Date()
  const index = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month) + 1
  return index > 0 ? `${index}` : 'not started'
}
