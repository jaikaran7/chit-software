import type { ReactNode } from 'react'
import { formatMoney, formatMonth, methodLabel, shiftMonth } from '../lib/format'

export function Header({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div>
        {eyebrow && <p className="text-sm font-medium text-grove">{eyebrow}</p>}
        <h1 className="font-display text-[2rem] leading-none tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-2 text-sm leading-5 text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-card p-4 shadow-sm ring-1 ring-line ${className}`}>{children}</section>
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  )
}

export const controlClass =
  'h-12 w-full rounded-2xl border border-line bg-white px-3 text-base text-ink outline-none ring-grove focus:ring-2'

export function Button({
  children,
  tone = 'grove',
  type = 'button',
  disabled,
  onClick,
}: {
  children: ReactNode
  tone?: 'grove' | 'clay' | 'ghost'
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
}) {
  const tones = {
    grove: 'bg-grove text-white',
    clay: 'bg-clay text-white',
    ghost: 'bg-white text-ink ring-1 ring-line',
  }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-14 w-full items-center justify-center rounded-2xl px-4 text-base font-semibold disabled:opacity-60 ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

export function Banner({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-[#fde8e4] px-3 py-3 text-sm text-clay">{children}</p>
}

const statusLabels: Record<string, string> = {
  NOT_PAID: 'Pending',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  ADVANCE: 'Advance',
  NOT_DUE: 'Not due',
  paid: 'Paid',
  posted: 'Recorded',
  voided: 'Reversed',
  none: 'None',
  scheduled: 'Scheduled',
  withdrawn: 'Withdrawn',
}

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    NOT_PAID: 'bg-[#f3e6d4] text-[#6b5344]',
    PARTIAL: 'bg-[#fde7c7] text-[#8a4b08]',
    PAID: 'bg-[#d9f3e8] text-grove-dark',
    ADVANCE: 'bg-[#d7eef8] text-sky',
    NOT_DUE: 'bg-[#eeeae4] text-muted',
    paid: 'bg-[#d9f3e8] text-grove-dark',
    posted: 'bg-[#d9f3e8] text-grove-dark',
    voided: 'bg-[#fde8e4] text-clay',
    none: 'bg-[#eeeae4] text-muted',
    scheduled: 'bg-[#fde7c7] text-[#8a4b08]',
    withdrawn: 'bg-[#d7eef8] text-sky',
  }
  const fallback = status.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase())
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status] ?? styles.NOT_DUE}`}>
      {statusLabels[status] ?? fallback}
    </span>
  )
}

export function Kpi({
  label,
  value,
  tone = 'ink',
}: {
  label: string
  value: string
  tone?: 'ink' | 'grove' | 'clay'
}) {
  const tones = { ink: 'text-ink', grove: 'text-grove', clay: 'text-clay' }
  return (
    <div className="rounded-3xl bg-card px-4 py-3 ring-1 ring-line">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 font-display text-[1.65rem] leading-none tabular-nums ${tones[tone]}`}>{value}</p>
    </div>
  )
}

export function RupeeInput({
  value,
  onChange,
  required,
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <div className="flex h-12 items-center rounded-2xl border border-line bg-white px-3 ring-grove focus-within:ring-2">
      <span className="text-muted">₹</span>
      <input
        className="h-full w-full bg-transparent px-2 text-base outline-none tabular-nums"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

export function Money({ value, muted = false }: { value: unknown; muted?: boolean }) {
  return <span className={muted ? 'text-muted' : 'font-semibold text-ink'}>{formatMoney(value)}</span>
}

export function MonthBar({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-2xl bg-card px-1 py-1 shadow-sm ring-1 ring-line">
      <button type="button" className="h-11 w-11 rounded-xl text-2xl" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
        ‹
      </button>
      <p className="font-display text-lg">{formatMonth(month)}</p>
      <button type="button" className="h-11 w-11 rounded-xl text-2xl" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month">
        ›
      </button>
    </div>
  )
}

export function MethodPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const methods = [
    ['cash', 'Cash'],
    ['gpay', 'GPay'],
    ['qr', 'QR'],
    ['bank_transfer', 'Bank'],
    ['other', 'Other'],
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {methods.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`h-12 rounded-2xl text-sm font-semibold ${value === id ? 'bg-grove text-white' : 'bg-white text-ink ring-1 ring-line'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="mt-2 text-sm leading-5 text-muted">{body}</p>
    </Card>
  )
}

export function methodText(method: string | null | undefined) {
  return methodLabel(method)
}
