import { describe, expect, it } from 'vitest'
import { parseAmount, parseMonth, parseTable } from './parseTable'

describe('parseAmount', () => {
  it('reads Indian grouped amounts', () => {
    expect(parseAmount('₹3,75,000')).toBe(375000)
    expect(parseAmount('20,000')).toBe(20000)
    expect(parseAmount('₹24,000')).toBe(24000)
  })

  it('rejects blanks and words', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })
})

describe('parseMonth', () => {
  it('reads common month formats', () => {
    expect(parseMonth('October 2026')).toBe('2026-10-01')
    expect(parseMonth('Oct-2026')).toBe('2026-10-01')
    expect(parseMonth('2026-11')).toBe('2026-11-01')
    expect(parseMonth('01/2027')).toBe('2027-01-01')
  })
})

describe('parseTable', () => {
  it('keeps headings and blank cells from a tab-separated table', () => {
    const parsed = parseTable('Month\tAmount\tNote\nOctober 2026\t₹3,75,000\t\nNovember 2026\t₹3,80,000\tkept')
    expect(parsed.headers).toEqual(['Month', 'Amount', 'Note'])
    expect(parsed.rows[0]).toEqual(['October 2026', '₹3,75,000', ''])
    expect(parsed.rows).toHaveLength(2)
  })
})
