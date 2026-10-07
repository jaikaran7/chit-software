export function asNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function formatMoney(value: unknown): string {
  const amount = asNumber(value)
  const whole = Math.abs(amount - Math.round(amount)) < 0.001
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: whole ? 0 : 2,
    minimumFractionDigits: whole ? 0 : 2,
  }).format(amount)
}

export function currentMonth(): string {
  const now = new Date()
  return monthIso(now.getFullYear(), now.getMonth() + 1)
}

export function monthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function shiftMonth(iso: string, delta: number): string {
  const [year, month] = iso.slice(0, 7).split('-').map(Number)
  const date = new Date(year, month - 1 + delta, 1)
  return monthIso(date.getFullYear(), date.getMonth() + 1)
}

export function formatMonth(value: string | null | undefined): string {
  if (!value) return '—'
  const [year, month] = value.slice(0, 7).split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  })
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—'
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${String(day).padStart(2, '0')} ${months[month - 1]} ${year}`
}

export function parseAmount(value: string): number {
  const cleaned = value.replace(/[^\d.]/g, '')
  if (!cleaned) return Number.NaN
  const amount = Number(cleaned)
  return Number.isFinite(amount) ? amount : Number.NaN
}

export function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function greeting(name?: string | null): string {
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first = name?.trim().split(' ')[0]
  return first ? `${hello}, ${first}` : hello
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'gpay', label: 'GPay' },
  { id: 'qr', label: 'QR' },
  { id: 'bank_transfer', label: 'Bank Transfer' },
  { id: 'other', label: 'Other' },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['id']

export function methodLabel(method: string | null | undefined): string {
  return PAYMENT_METHODS.find((item) => item.id === method)?.label ?? method ?? '—'
}
