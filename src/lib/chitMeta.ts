import { monthSequence } from './payoutPlan'
import { currentMonth, shiftMonth } from './format'

export type ChitKind = 'fixed' | 'auction'
export type ChitPay = 'fixed' | 'commission'
export type ChitLife = 'draft' | 'active' | 'completed'

export type ChitMeta = {
  v: 1
  kind: ChitKind
  pay: ChitPay
  installmentRise: number | null
  pot: number | null
  shares: number | null
  months: number | null
  start: string | null
  life: ChitLife
  note: string
  companyMonths: string[]
}

export type MemberProfile = {
  email: string
  portal: boolean
  legacy: string
}

export type ShareNote = {
  shares: number
  pool: { name: string; part: number }[]
}

const emptyMeta = (): ChitMeta => ({
  v: 1,
  kind: 'fixed',
  pay: 'fixed',
  installmentRise: null,
  pot: null,
  shares: null,
  months: null,
  start: null,
  life: 'active',
  note: '',
  companyMonths: [],
})

export function readChitMeta(description: string | null | undefined): ChitMeta {
  if (!description) return emptyMeta()
  try {
    const parsed = JSON.parse(description) as Partial<ChitMeta>
    if (parsed.v === 1) {
      return {
        v: 1,
        kind: parsed.kind === 'auction' ? 'auction' : 'fixed',
        pay: parsed.pay === 'commission' ? 'commission' : 'fixed',
        installmentRise: numberOrNull(parsed.installmentRise),
        pot: numberOrNull(parsed.pot),
        shares: numberOrNull(parsed.shares),
        months: numberOrNull(parsed.months),
        start: typeof parsed.start === 'string' ? parsed.start : null,
        life: parsed.life === 'draft' || parsed.life === 'completed' ? parsed.life : 'active',
        note: typeof parsed.note === 'string' ? parsed.note : '',
        companyMonths: Array.isArray(parsed.companyMonths) ? parsed.companyMonths.filter((item) => typeof item === 'string') : [],
      }
    }
  } catch {
    // Plain descriptions from the older form stay as a note.
  }
  return { ...emptyMeta(), note: description }
}

export function writeChitMeta(meta: ChitMeta): string {
  return JSON.stringify({ ...meta, v: 1 })
}

export function readProfile(notes: string | null | undefined): MemberProfile {
  if (!notes) return { email: '', portal: false, legacy: '' }
  try {
    const parsed = JSON.parse(notes) as Partial<MemberProfile> & { v?: number }
    if (parsed.v === 1) {
      return {
        email: parsed.email ?? '',
        portal: Boolean(parsed.portal),
        legacy: parsed.legacy ?? '',
      }
    }
  } catch {
    // Older notes are free text.
  }
  return { email: '', portal: false, legacy: notes }
}

export function writeProfile(profile: MemberProfile): string {
  if (!profile.email && !profile.portal && profile.legacy && !profile.legacy.trim().startsWith('{')) {
    return profile.legacy
  }
  return JSON.stringify({ v: 1, email: profile.email, portal: profile.portal, legacy: profile.legacy })
}

export function readShares(notes: string | null | undefined): ShareNote {
  if (!notes) return { shares: 1, pool: [] }
  try {
    const parsed = JSON.parse(notes) as { v?: number; shares?: number; pool?: { name: string; part: number }[] }
    if (parsed.v === 1) {
      const shares = Math.max(1, Math.round(Number(parsed.shares) || 1))
      const pool = Array.isArray(parsed.pool)
        ? parsed.pool.filter((row) => row && typeof row.name === 'string').map((row) => ({
            name: row.name,
            part: Number(row.part) || 0,
          }))
        : []
      return { shares, pool }
    }
  } catch {
    // Membership notes that are not ours stay untouched by callers that rewrite only share JSON.
  }
  return { shares: 1, pool: [] }
}

export function writeShares(note: ShareNote, previous: string | null | undefined): string {
  const shares = Math.max(1, Math.round(note.shares))
  const pool = note.pool.filter((row) => row.name.trim())
  if (shares === 1 && pool.length === 0 && previous && !previous.trim().startsWith('{')) return previous
  return JSON.stringify({ v: 1, shares, pool })
}

export function compactLakhs(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '₹0'
  if (amount >= 10000000) {
    const cr = amount / 10000000
    return `₹${trimNumber(cr)}Cr`
  }
  if (amount >= 100000) {
    const lakhs = amount / 100000
    return `₹${trimNumber(lakhs)}L`
  }
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

export function chitTitle(name: string, meta: ChitMeta, memberCount: number): string {
  if (name.trim()) return name.trim()
  const pot = meta.pot ? compactLakhs(meta.pot) : 'Chit'
  const shares = meta.shares ?? memberCount
  const months = meta.months ?? shares
  return `${pot} · ${shares}M · ${months} Months`
}

export function monthWindow(start: string | null, total: number | null, anchor: string): string[] {
  if (start && total && total > 0 && total <= 120) return monthSequence(start.slice(0, 7), total)
  const origin = anchor || currentMonth()
  return Array.from({ length: 8 }, (_, index) => shiftMonth(origin, index - 1))
}

export function monthChip(iso: string): { short: string; year: string } {
  const [year, month] = iso.slice(0, 7).split('-').map(Number)
  const short = new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'short' })
  return { short, year: String(year).slice(2) }
}

export function daysUntilMonthEnd(iso: string, today = new Date()): number {
  const [year, month] = iso.slice(0, 7).split('-').map(Number)
  const end = new Date(year, month, 0)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000))
}

export function isFutureMonth(iso: string, today = currentMonth()): boolean {
  return iso.slice(0, 7) > today.slice(0, 7)
}

export function isPastMonth(iso: string, today = currentMonth()): boolean {
  return iso.slice(0, 7) < today.slice(0, 7)
}

export function evenAmounts(first: number, last: number, count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [Math.round(first)]
  const step = (last - first) / (count - 1)
  return Array.from({ length: count }, (_, index) => Math.round(first + step * index))
}

/** Prize rises by a fixed extra every month, starting at `first`. */
export function steppedAmounts(first: number, extra: number, count: number): number[] {
  if (count <= 0) return []
  return Array.from({ length: count }, (_, index) => Math.round(first + extra * index))
}

/**
 * One share withdraws each month. That month it still pays `normal`.
 * From the next month it pays `post`. `monthIndex` is 0 for the first month.
 */
export function shareMonthCollection(monthIndex: number, shares: number, normal: number, post: number): number {
  const paying = Math.max(shares, 0)
  const alreadyOut = Math.min(Math.max(monthIndex, 0), paying)
  return (paying - alreadyOut) * normal + alreadyOut * post
}

/** One share's installment in a commission chit. Month 0 is `first`; each later month adds `rise`. Withdrawal does not change it. */
export function commissionShareDue(monthIndex: number, first: number, rise: number): number {
  const base = Number.isFinite(first) ? first : 0
  const extra = Number.isFinite(rise) ? rise : 0
  return Math.round(base + extra * Math.max(monthIndex, 0))
}

export function commissionMonthCollection(monthIndex: number, shares: number, first: number, rise: number): number {
  return Math.max(shares, 0) * commissionShareDue(monthIndex, first, rise)
}

export function commissionLifetimeCollections(months: number, shares: number, first: number, rise: number): number {
  let total = 0
  for (let index = 0; index < Math.max(months, 0); index += 1) {
    total += commissionMonthCollection(index, shares, first, rise)
  }
  return total
}

export function lifetimeCollections(months: number, shares: number, normal: number, post: number): number {
  let total = 0
  for (let index = 0; index < Math.max(months, 0); index += 1) {
    total += shareMonthCollection(index, shares, normal, post)
  }
  return total
}

export function suggestPrizeEnds(pot: number): { first: number; last: number } {
  if (!(pot > 0)) return { first: 0, last: 0 }
  return {
    first: Math.round((pot * 0.7) / 1000) * 1000,
    last: Math.round((pot * 0.95) / 1000) * 1000,
  }
}

export function marginForPlan(collected: number, prizes: number): number {
  return collected - prizes
}

function numberOrNull(value: unknown): number | null {
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(amount) ? amount : null
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}
