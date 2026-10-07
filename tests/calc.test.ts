import { describe, expect, it } from 'vitest'
import { buildHistory, computeHolding, computePosition, goldUsdOzToThaiBaht, summarize, priceAt, resolveTransactions } from '../src/calc'
import type { Asset, Transaction } from '../src/db'

const tx = (p: Partial<Transaction>): Transaction => ({ id: Math.random().toString(), assetId: 'a', side: 'BUY', date: '2025-01-01', quantity: 1, priceTHB: 1, feeTHB: 0, ...p })
const asset = (p: Partial<Asset> = {}): Asset => ({ id: 'a', type: 'TH_STOCK', symbol: 'PTT.BK', name: 'PTT', createdAt: '', ...p })

describe('computePosition', () => {
  it('weighted average across multiple buys incl. fees', () => {
    const p = computePosition([
      tx({ date: '2025-01-01', quantity: 100, priceTHB: 30, feeTHB: 10 }),
      tx({ date: '2025-02-01', quantity: 100, priceTHB: 40, feeTHB: 10 }),
    ])
    expect(p.quantity).toBe(200)
    expect(p.costBasis).toBe(7020)
    expect(p.avgCost).toBeCloseTo(35.1)
  })
  it('partial sell keeps avg and books realized P/L', () => {
    const p = computePosition([
      tx({ date: '2025-01-01', quantity: 100, priceTHB: 30 }),
      tx({ date: '2025-02-01', quantity: 100, priceTHB: 40 }),
      tx({ date: '2025-03-01', side: 'SELL', quantity: 50, priceTHB: 50, feeTHB: 5 }),
    ])
    expect(p.quantity).toBe(150)
    expect(p.avgCost).toBeCloseTo(35)
    expect(p.realizedPL).toBeCloseTo(50 * 15 - 5)
  })
  it('full sell resets basis; later buy starts fresh', () => {
    const p = computePosition([
      tx({ date: '2025-01-01', quantity: 10, priceTHB: 100 }),
      tx({ date: '2025-02-01', side: 'SELL', quantity: 10, priceTHB: 120 }),
      tx({ date: '2025-03-01', quantity: 5, priceTHB: 80 }),
    ])
    expect(p.quantity).toBe(5)
    expect(p.avgCost).toBe(80)
    expect(p.realizedPL).toBe(200)
  })
  it('respects upToDate', () => {
    const txs = [tx({ date: '2025-01-01', quantity: 1 }), tx({ date: '2025-06-01', quantity: 2 })]
    expect(computePosition(txs, '2025-03-01').quantity).toBe(1)
  })
})

describe('holding & summary', () => {
  it('P/L and allocation', () => {
    const h1 = computeHolding(asset(), [tx({ quantity: 100, priceTHB: 30 })], 33)
    const h2 = computeHolding(asset({ id: 'g', type: 'GOLD' }), [tx({ assetId: 'g', quantity: 1, priceTHB: 40000 })], 41000)
    expect(h1.unrealizedPL).toBeCloseTo(300)
    expect(h1.unrealizedPct).toBeCloseTo(10)
    const s = summarize([h1, h2])
    expect(s.value).toBe(44300)
    expect(s.allocation[0].group).toBe('Gold')
    expect(s.allocation.reduce((a, b) => a + b.pct, 0)).toBeCloseTo(100)
  })
  it('falls back to manual price', () => {
    const h = computeHolding(asset({ manualPrice: 12 }), [tx({ quantity: 10, priceTHB: 10 })], null)
    expect(h.value).toBe(120)
  })
})

describe('gold conversion', () => {
  it('USD/oz -> THB per baht-weight 96.5%', () => {
    // 2650 USD/oz, 34 THB/USD -> ~42,6xx THB per baht gold
    const v = goldUsdOzToThaiBaht(2650, 34)
    expect(v).toBeCloseTo((2650 * 34 * 15.244 * 0.965) / 31.1035, 6)
    expect(v).toBeGreaterThan(42000)
    expect(v).toBeLessThan(43000)
    expect(goldUsdOzToThaiBaht(2650, 34, 100)).toBeCloseTo(v + 100)
  })
})

describe('history', () => {
  it('priceAt forward-fills', () => {
    const s: [string, number][] = [['2025-01-01', 1], ['2025-01-05', 2]]
    expect(priceAt(s, '2025-01-03')).toBe(1)
    expect(priceAt(s, '2025-01-09')).toBe(2)
    expect(priceAt(s, '2024-12-01')).toBe(1)
  })
  it('time-weighted return ignores deposits', () => {
    const grid = ['2025-01-01', '2025-01-02', '2025-01-03']
    const series = { a: [['2025-01-01', 10], ['2025-01-02', 11], ['2025-01-03', 11]] as [string, number][] }
    const txs = [tx({ date: '2025-01-01', quantity: 10, priceTHB: 10 }), tx({ date: '2025-01-03', quantity: 100, priceTHB: 11 })]
    const h = buildHistory([asset()], txs, series, grid)
    expect(h[2].value).toBe(110 * 11)
    expect(h[2].twr).toBeCloseTo(10) // only the +10% move, not the deposit
  })
})

describe('paying with USD from the portfolio', () => {
  // USD bought at 36 and 34 -> avg 35; AAPL bought with 1,000 USD -> THB cost uses avg 35
  const txs: Transaction[] = [
    tx({ id: 'u1', assetId: 'usd', date: '2025-01-01', quantity: 1000, priceTHB: 36 }),
    tx({ id: 'u2', assetId: 'usd', date: '2025-02-01', quantity: 1000, priceTHB: 34 }),
    tx({ id: 'a1', assetId: 'aapl', date: '2025-03-01', quantity: 5, priceTHB: 0, currency: 'USD', priceFx: 199, feeFx: 5, linkedTxId: 'leg1' }),
    tx({ id: 'leg1', assetId: 'usd', side: 'SELL', date: '2025-03-01', quantity: 1000, priceTHB: 0, linkedTxId: 'a1', linkRole: 'cash' }),
  ]
  const r = resolveTransactions(txs)
  const byAsset = (id: string) => r.filter((t) => t.assetId === id)

  it('stock cost = USD spent x USD average cost, fee included', () => {
    const p = computePosition(byAsset('aapl'))
    expect(p.costBasis).toBeCloseTo(1000 * 35)
    expect(p.avgCost).toBeCloseTo(7000)
  })
  it('USD position drops by the amount spent with no realized FX P/L', () => {
    const p = computePosition(byAsset('usd'))
    expect(p.quantity).toBe(1000)
    expect(p.avgCost).toBeCloseTo(35)
    expect(p.realizedPL).toBeCloseTo(0)
  })
  it('later backdated USD buy changes the resolved stock cost', () => {
    const more = resolveTransactions([...txs, tx({ id: 'u0', assetId: 'usd', date: '2024-12-01', quantity: 2000, priceTHB: 32 })])
    // avg before 2025-03-01 = (36000+34000+64000)/4000 = 33.5
    expect(computePosition(more.filter((t) => t.assetId === 'aapl')).costBasis).toBeCloseTo(1000 * 33.5)
  })
  it('falls back to the stored snapshot when the cash leg is missing', () => {
    const lone = resolveTransactions([tx({ id: 'x', assetId: 'aapl', quantity: 1, priceTHB: 7000, currency: 'USD', priceFx: 200, linkedTxId: 'gone' })])
    expect(lone[0].priceTHB).toBe(7000)
  })
})
