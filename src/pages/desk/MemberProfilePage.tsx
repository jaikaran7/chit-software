import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DeskCard } from '../../components/desk-ui'
import { asNumber, currentMonth, errorMessage, formatMoney, formatShortDate, methodLabel } from '../../lib/format'
import { getStatement } from '../../services/memberships'
import { getMember } from '../../services/members'
import { isRecorded, listMembershipHistory, type MoneyMove } from '../../services/money'

type ChitRef = { id: string; name: string } | { id: string; name: string }[] | null

type Seat = {
  id: string
  status: string
  groups: ChitRef
}

type LedgerLine = MoneyMove & { chit: string }

function chitName(groups: ChitRef) {
  if (!groups) return 'Chit'
  const row = Array.isArray(groups) ? groups[0] : groups
  return row?.name || 'Chit'
}

export function MemberProfilePage() {
  const { memberId = '' } = useParams()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [chits, setChits] = useState<{ name: string; owed: number }[]>([])
  const [ledger, setLedger] = useState<LedgerLine[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getMember(memberId)
      .then(async (member) => {
        if (!member || cancelled) return
        setName(member.name)
        setPhone(member.mobile ?? '')
        setAddress(member.address ?? '')
        const seats = (member.group_memberships ?? []) as Seat[]
        const through = currentMonth()
        const packs = await Promise.all(seats.map(async (seat) => {
          const [history, statement] = await Promise.all([
            listMembershipHistory(seat.id),
            getStatement(seat.id, through),
          ])
          const latest = statement.at(-1)
          const owed = asNumber(latest?.outstanding) + asNumber(latest?.joining_outstanding)
          const chit = chitName(seat.groups)
          return {
            chit,
            owed,
            lines: history.filter((move) => isRecorded(move.status)).map((move) => ({ ...move, chit })),
          }
        }))
        if (cancelled) return
        setChits(packs.map((pack) => ({ name: pack.chit, owed: pack.owed })))
        setLedger(packs.flatMap((pack) => pack.lines).sort((a, b) => (a.happenedOn < b.happenedOn ? 1 : -1)))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [memberId])

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link to="/members" className="grid h-9 w-9 place-items-center rounded-full bg-white text-sm ring-1 ring-slate-200">←</Link>
        <Link to={`/members/${memberId}/edit`} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
          Edit
        </Link>
      </div>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <DeskCard className="p-4">
        <h1 className="text-xl font-semibold">{name || 'Member'}</h1>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-slate-400">NUMBER</dt>
            <dd className="mt-0.5">{phone || '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-slate-400">ADDRESS</dt>
            <dd className="mt-0.5">{address || '—'}</dd>
          </div>
        </dl>
      </DeskCard>
      {chits.length > 0 && (
        <DeskCard className="mt-3 p-4">
          <h2 className="text-[10px] font-semibold tracking-[0.14em] text-slate-400">CHITS</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {chits.map((chit) => (
              <li key={chit.name} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{chit.name}</span>
                <span className={chit.owed > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}>
                  {chit.owed > 0 ? formatMoney(chit.owed) : 'Clear'}
                </span>
              </li>
            ))}
          </ul>
        </DeskCard>
      )}
      <DeskCard className="mt-3 p-4">
        <h2 className="text-center text-[10px] font-semibold tracking-[0.14em] text-slate-400">LEDGER</h2>
        {ledger.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No payments yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {ledger.map((line) => {
              const body = (
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{line.chit}</p>
                    <p className="text-[11px] text-slate-400">
                      {formatShortDate(line.happenedOn)} · {methodLabel(line.method)} · {line.kind === 'debit' ? 'Paid out' : 'Collected'}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-semibold ${line.kind === 'debit' ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {line.kind === 'debit' ? '−' : '+'} {formatMoney(line.amount)}
                  </p>
                </div>
              )
              return (
                <li key={`${line.kind}-${line.createdAt}-${line.chit}-${line.amount}`}>
                  {line.receiptId ? <Link to={`/receipts/${line.receiptId}`}>{body}</Link> : body}
                </li>
              )
            })}
          </ul>
        )}
      </DeskCard>
    </div>
  )
}
