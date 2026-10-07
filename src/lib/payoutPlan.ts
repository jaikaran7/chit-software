import { shiftMonth } from './format'

export type PayoutDraft = {
  month: string
  amount: string
  touched: boolean
}

export function monthSequence(startMonth: string, total: number): string[] {
  const start = startMonth.length === 7 ? `${startMonth}-01` : startMonth
  const count = Math.max(0, Math.floor(total))
  const months: string[] = []
  let cursor = start
  for (let index = 0; index < count; index += 1) {
    months.push(cursor)
    cursor = shiftMonth(cursor, 1)
  }
  return months
}

export function alignDrafts(startMonth: string, total: number, previous: PayoutDraft[]): PayoutDraft[] {
  return monthSequence(startMonth, total).map((month) => {
    return previous.find((row) => row.month === month) ?? { month, amount: '', touched: false }
  })
}

function amountText(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

export function fillIncreasing(
  rows: PayoutDraft[],
  first: number,
  increase: number,
  onlyUntouched = true,
): PayoutDraft[] {
  if (!Number.isFinite(first) || first <= 0) return rows
  const step = Number.isFinite(increase) ? increase : 0
  return rows.map((row, index) => {
    if (onlyUntouched && row.touched) return row
    return { ...row, amount: amountText(first + step * index), touched: onlyUntouched ? row.touched : false }
  })
}
