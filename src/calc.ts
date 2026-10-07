import type { Asset, Transaction, Group } from './db'
import { GROUP_OF } from './db'

export const TROY_OZ_G = 31.1035
export const BAHT_GOLD_G = 15.244
export const GOLD_PURITY = 0.965

/** Convert world gold spot (USD per troy ounce) into Thai baht-weight 96.5% price in THB */
export function goldUsdOzToThaiBaht(usdPerOz: number, usdThb: number, premiumTHB = 0) {
  return (usdPerOz * usdThb * BAHT_GOLD_G * GOLD_PURITY) / TROY_OZ_G + premiumTHB
}

export interface Position {
  quantity: number
  /** remaining cost basis in THB (incl. buy fees) */
  costBasis: number
  avgCost: number
  realizedPL: number
  totalBought: number
  totalSold: number
}

const sortTx = (txs: Transaction[]) =>
  [...txs].sort((a, b) => (a.date === b.date ? (a.side === 'BUY' ? -1 : 1) : a.date < b.date ? -1 : 1))

/** Weighted-average cost. Sells reduce quantity at the current average and book realized P/L. */
export function computePosition(txs: Transaction[], upToDate?: string): Position {
  let quantity = 0
  let costBasis = 0
  let realizedPL = 0
  let totalBought = 0
  let totalSold = 0
  for (const t of sortTx(txs)) {
    if (upToDate && t.date > upToDate) break
    if (t.side === 'BUY') {
      const cost = t.quantity * t.priceTHB + (t.feeTHB || 0)
      costBasis += cost
      quantity += t.quantity
      totalBought += cost
    } else {
      const q = Math.min(t.quantity, quantity)
      const avg = quantity > 0 ? costBasis / quantity : 0
      const proceeds = q * t.priceTHB - (t.feeTHB || 0)
      realizedPL += proceeds - avg * q
      costBasis -= avg * q
      quantity -= q
      totalSold += proceeds
      if (quantity < 1e-12) {
        quantity = 0
        costBasis = 0
      }
    }
  }
  return { quantity, costBasis, avgCost: quantity > 0 ? costBasis / quantity : 0, realizedPL, totalBought, totalSold }
}

/**
 * Trades bought with USD/USDT from the portfolio take their THB cost from the cash position's
 * average cost at that moment (so the THB you originally paid for the dollars carries over).
 * Walks all transactions in date order and fills priceTHB/feeTHB of those pairs.
 * Returns copies; the stored snapshot values are only a fallback when the cash leg is missing.
 */
export function resolveTransactions(txs: Transaction[]): Transaction[] {
  const out = txs.map((t) => ({ ...t }))
  const byId = new Map(out.map((t) => [t.id, t]))
  const pos = new Map<string, { q: number; c: number }>()
  for (const t of sortTx(out)) {
    if (t.side === 'BUY' && t.currency && t.linkedTxId && t.priceFx != null) {
      const leg = byId.get(t.linkedTxId)
      const p = leg && pos.get(leg.assetId)
      if (leg && p && p.q > 0) {
        const avg = p.c / p.q
        t.fxRate = avg
        t.priceTHB = t.priceFx * avg
        t.feeTHB = (t.feeFx ?? 0) * avg
        leg.priceTHB = avg
      }
    }
    const p = pos.get(t.assetId) ?? { q: 0, c: 0 }
    if (t.side === 'BUY') {
      p.q += t.quantity
      p.c += t.quantity * t.priceTHB + (t.feeTHB || 0)
    } else {
      const q = Math.min(t.quantity, p.q)
      const avg = p.q > 0 ? p.c / p.q : 0
      p.c -= avg * q
      p.q -= q
      if (p.q < 1e-12) p.q = p.c = 0
    }
    pos.set(t.assetId, p)
  }
  return out
}

export interface Holding extends Position {
  asset: Asset
  price: number | null
  value: number
  unrealizedPL: number
  unrealizedPct: number
}

export function computeHolding(asset: Asset, txs: Transaction[], price: number | null): Holding {
  const p = computePosition(txs)
  const px = price ?? asset.manualPrice ?? null
  const value = px != null ? p.quantity * px : p.costBasis
  const unrealizedPL = px != null ? value - p.costBasis : 0
  return {
    ...p,
    asset,
    price: px,
    value,
    unrealizedPL,
    unrealizedPct: p.costBasis > 0 ? (unrealizedPL / p.costBasis) * 100 : 0,
  }
}

export interface PortfolioSummary {
  value: number
  costBasis: number
  unrealizedPL: number
  unrealizedPct: number
  realizedPL: number
  totalPL: number
  allocation: { group: Group; value: number; pct: number }[]
}

export function summarize(holdings: Holding[]): PortfolioSummary {
  const value = holdings.reduce((s, h) => s + h.value, 0)
  const costBasis = holdings.reduce((s, h) => s + h.costBasis, 0)
  const unrealizedPL = holdings.reduce((s, h) => s + h.unrealizedPL, 0)
  const realizedPL = holdings.reduce((s, h) => s + h.realizedPL, 0)
  const byGroup = new Map<Group, number>()
  for (const h of holdings) {
    if (h.value <= 0) continue
    const g = GROUP_OF[h.asset.type]
    byGroup.set(g, (byGroup.get(g) ?? 0) + h.value)
  }
  const allocation = [...byGroup.entries()]
    .map(([group, v]) => ({ group, value: v, pct: value > 0 ? (v / value) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
  return {
    value,
    costBasis,
    unrealizedPL,
    unrealizedPct: costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0,
    realizedPL,
    totalPL: unrealizedPL + realizedPL,
    allocation,
  }
}

// ---------- History ----------

export type Range = '3M' | '1Y' | '3Y'
export const RANGE_DAYS: Record<Range, number> = { '3M': 91, '1Y': 365, '3Y': 365 * 3 }

export const toISO = (d: Date) => d.toISOString().slice(0, 10)

export function dateGrid(range: Range, today = new Date()): string[] {
  const step = range === '3Y' ? 7 : 1
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const out: string[] = []
  for (let i = RANGE_DAYS[range]; i >= 0; i -= step) {
    out.push(toISO(new Date(end.getTime() - i * 86400000)))
  }
  if (out[out.length - 1] !== toISO(end)) out.push(toISO(end))
  return out
}

/** Price series in THB per unit, as sorted [yyyy-mm-dd, price] pairs */
export type PriceSeries = [string, number][]

/** Last known value at or before `date` (forward fill); falls back to the first point */
export function priceAt(series: PriceSeries, date: string): number | null {
  if (!series.length) return null
  let lo = 0
  let hi = series.length - 1
  if (date < series[0][0]) return series[0][1]
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (series[mid][0] <= date) lo = mid
    else hi = mid - 1
  }
  return series[lo][1]
}

export interface HistoryPoint {
  date: string
  value: number
  costBasis: number
  /** realized P/L booked up to this date */
  realizedPL: number
  /** cumulative time-weighted return in % since start of range */
  twr: number
}

/**
 * Builds portfolio value over time. For each asset, price comes from its THB series; if none,
 * falls back to the latest transaction price on/before the date, then manualPrice.
 * Return is time-weighted so new deposits don't count as profit.
 */
export function buildHistory(
  assets: Asset[],
  txs: Transaction[],
  series: Record<string, PriceSeries>,
  grid: string[],
): HistoryPoint[] {
  const txByAsset = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (!txByAsset.has(t.assetId)) txByAsset.set(t.assetId, [])
    txByAsset.get(t.assetId)!.push(t)
  }
  const fallbackPrice = (a: Asset, date: string) => {
    const list = sortTx(txByAsset.get(a.id) ?? []).filter((t) => t.date <= date)
    return list.length ? list[list.length - 1].priceTHB : (a.manualPrice ?? 0)
  }

  const out: HistoryPoint[] = []
  let twr = 1
  let prevValue = 0
  let prevDate = ''
  for (const date of grid) {
    let value = 0
    let costBasis = 0
    let realizedPL = 0
    for (const a of assets) {
      const list = txByAsset.get(a.id) ?? []
      const pos = computePosition(list, date)
      realizedPL += pos.realizedPL
      if (pos.quantity <= 0) continue
      const s = series[a.id]
      const px = (s && priceAt(s, date)) ?? fallbackPrice(a, date)
      value += pos.quantity * px
      costBasis += pos.costBasis
    }
    // net external flow between prevDate (exclusive) and date (inclusive)
    let flow = 0
    for (const t of txs) {
      if (t.date > prevDate && t.date <= date && prevDate !== '') {
        flow += t.side === 'BUY' ? t.quantity * t.priceTHB + (t.feeTHB || 0) : -(t.quantity * t.priceTHB - (t.feeTHB || 0))
      }
    }
    if (prevValue > 0) {
      const r = (value - flow) / prevValue
      if (Number.isFinite(r) && r > 0) twr *= r
    }
    out.push({ date, value, costBasis, realizedPL, twr: (twr - 1) * 100 })
    prevValue = value
    prevDate = date
  }
  return out
}
