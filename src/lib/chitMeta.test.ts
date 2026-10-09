import { describe, expect, it } from 'vitest'
import { commissionLifetimeCollections, commissionShareDue, evenAmounts, lifetimeCollections, marginForPlan, readChitMeta, readShares, shareMonthCollection, steppedAmounts, suggestPrizeEnds, writeChitMeta } from './chitMeta'

describe('chit meta', () => {
  it('keeps a plain description as a note', () => {
    expect(readChitMeta('family chit').note).toBe('family chit')
    expect(readChitMeta('family chit').kind).toBe('fixed')
  })

  it('round-trips a plan', () => {
    const raw = writeChitMeta({
      v: 1,
      kind: 'fixed',
      pay: 'fixed',
      installmentRise: null,
      pot: 500000,
      shares: 20,
      months: 20,
      start: '2026-11-01',
      life: 'active',
      note: '',
      companyMonths: ['2026-11-01'],
    })
    expect(readChitMeta(raw).pot).toBe(500000)
    expect(readChitMeta(raw).start).toBe('2026-11-01')
  })

  it('fills prizes without crossing the two ends', () => {
    const rows = evenAmounts(350000, 475000, 4)
    expect(rows[0]).toBe(350000)
    expect(rows[3]).toBe(475000)
    expect(rows[1]).toBeGreaterThan(rows[0])
  })

  it('suggests prizes under the pot', () => {
    const ends = suggestPrizeEnds(500000)
    expect(ends.first).toBe(350000)
    expect(ends.last).toBe(475000)
    expect(ends.last).toBeLessThan(500000)
  })

  it('keeps the company margin as collections minus prizes', () => {
    expect(marginForPlan(10000000, 9927500)).toBe(72500)
  })

  it('charges the higher installment only after the withdrawal month', () => {
    expect(shareMonthCollection(0, 20, 25000, 30000)).toBe(500000)
    expect(shareMonthCollection(1, 20, 25000, 30000)).toBe(19 * 25000 + 30000)
    expect(shareMonthCollection(19, 20, 25000, 30000)).toBe(25000 + 19 * 30000)
  })

  it('keeps company commission as every month’s collections minus prizes', () => {
    const collected = lifetimeCollections(20, 20, 25000, 30000)
    expect(collected).toBe(20 * 500000 + 5000 * (19 * 20) / 2)
    expect(marginForPlan(collected, 10450000)).toBe(collected - 10450000)
  })

  it('raises a prize by a fixed extra when the chit is not one withdrawal per member', () => {
    expect(steppedAmounts(475000, 5000, 3)).toEqual([475000, 480000, 485000])
  })

  it('raises every share by the same amount each month, withdrawal or not', () => {
    expect(commissionShareDue(0, 25000, 5500)).toBe(25000)
    expect(commissionShareDue(1, 25000, 5500)).toBe(30500)
    expect(commissionShareDue(2, 25000, 5500)).toBe(36000)
    expect(commissionLifetimeCollections(3, 20, 25000, 5500)).toBe(20 * (25000 + 30500 + 36000))
    expect(commissionShareDue(0, 25000, Number.NaN)).toBe(25000)
    expect(commissionShareDue(2, 25000, Number.NaN)).toBe(25000)
  })

  it('keeps older plans on the fixed pay style', () => {
    const raw = JSON.stringify({
      v: 1,
      kind: 'fixed',
      pot: 500000,
      shares: 20,
      months: 20,
      start: '2026-11-01',
      life: 'active',
      note: '',
      companyMonths: [],
    })
    expect(readChitMeta(raw).pay).toBe('fixed')
    expect(readChitMeta(raw).installmentRise).toBeNull()
  })

  it('remembers a commission plan and its monthly rise', () => {
    const raw = writeChitMeta({
      v: 1,
      kind: 'fixed',
      pay: 'commission',
      installmentRise: 5500,
      pot: 500000,
      shares: 20,
      months: 20,
      start: '2026-11-01',
      life: 'active',
      note: '',
      companyMonths: [],
    })
    expect(readChitMeta(raw).pay).toBe('commission')
    expect(readChitMeta(raw).installmentRise).toBe(5500)
  })

  it('reads share counts', () => {
    expect(readShares(JSON.stringify({ v: 1, shares: 10, pool: [] })).shares).toBe(10)
    expect(readShares('bring cash').shares).toBe(1)
  })
})
