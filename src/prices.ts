import { db, getSettings, type Asset } from './db'
import { goldUsdOzToThaiBaht, toISO, type PriceSeries, type Range, priceAt } from './calc'

export const GOLD_SYMBOL = 'GC=F'
export const FX_SYMBOL: Record<string, string> = { USD: 'USDTHB=X', HKD: 'HKDTHB=X', CNY: 'CNYTHB=X', EUR: 'EURTHB=X', JPY: 'JPYTHB=X' }

/** Symbol used for a given asset type when the user doesn't pick one */
export const DEFAULT_SYMBOL: Partial<Record<Asset['type'], { symbol: string; name: string }>> = {
  USD: { symbol: 'USDTHB=X', name: 'US Dollar' },
  GOLD: { symbol: GOLD_SYMBOL, name: 'ทองคำแท่ง 96.5%' },
  CRYPTO: { symbol: 'BTC-USD', name: 'Bitcoin' },
}

async function api<T>(path: string): Promise<T> {
  const s = await getSettings()
  if (!s.workerUrl) throw new Error('ยังไม่ได้ตั้งค่า Worker URL (ไปที่ ตั้งค่า)')
  const res = await fetch(s.workerUrl.replace(/\/$/, '') + path, {
    headers: s.accessToken ? { 'X-Access-Token': s.accessToken } : {},
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.trim())
  return res.json() as Promise<T>
}

export interface SearchResult {
  symbol: string
  name: string
  exchange?: string
  type?: string
}

export const searchSymbols = (q: string) =>
  api<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(q)}`).then((r) => r.results)

export const searchFunds = (q: string) =>
  api<{ results: SearchResult[] }>(`/fund/search?q=${encodeURIComponent(q)}`).then((r) => r.results)

interface Quote {
  price: number
  currency: string
  time: number
}

/** Fetch live prices for all assets, convert to THB, cache in IndexedDB. Returns errors per asset. */
export async function refreshPrices(assets: Asset[]): Promise<Record<string, string>> {
  const errors: Record<string, string> = {}
  const settings = await getSettings()
  const market = assets.filter((a) => a.type !== 'FUND')
  const funds = assets.filter((a) => a.type === 'FUND')

  if (market.length) {
    const symbols = new Set(market.map((a) => a.symbol))
    Object.values(FX_SYMBOL).forEach((s) => symbols.add(s))
    try {
      const { quotes } = await api<{ quotes: Record<string, Quote | null> }>(
        `/quote?symbols=${encodeURIComponent([...symbols].join(','))}`,
      )
      const fx = (cur: string) => (cur === 'THB' ? 1 : (quotes[FX_SYMBOL[cur]]?.price ?? null))
      for (const a of market) {
        const q = quotes[a.symbol]
        if (!q) {
          errors[a.id] = 'ไม่พบราคา'
          continue
        }
        let thb: number | null
        if (a.type === 'GOLD') {
          const usd = fx('USD')
          thb = usd ? goldUsdOzToThaiBaht(q.price, usd, settings.goldPremiumTHB) : null
        } else if (a.symbol.endsWith('THB=X')) {
          thb = q.price
        } else {
          const rate = fx(q.currency)
          thb = rate != null ? q.price * rate : null
        }
        if (thb == null) errors[a.id] = `ไม่มีอัตราแลกเปลี่ยน ${q.currency}`
        else await db.prices.put({ key: a.id, priceTHB: thb, ts: Date.now() })
      }
    } catch (e) {
      market.forEach((a) => (errors[a.id] = String((e as Error).message)))
    }
  }

  await Promise.all(
    funds.map(async (a) => {
      try {
        const r = await api<{ nav: number | null; date: string }>(`/fund/nav?proj_id=${encodeURIComponent(a.symbol)}`)
        if (r.nav == null) errors[a.id] = 'ไม่พบ NAV'
        else await db.prices.put({ key: a.id, priceTHB: r.nav, ts: Date.now(), asOf: r.date })
      } catch (e) {
        errors[a.id] = String((e as Error).message)
      }
    }),
  )
  return errors
}

const RANGE_PARAM: Record<Range, string> = { '3M': '3mo', '1Y': '1y', '3Y': '3y' }
const HISTORY_TTL = 6 * 3600 * 1000

async function rawHistory(symbol: string, range: Range, fund = false) {
  const key = `${symbol}|${range}`
  const cached = await db.history.get(key)
  if (cached && Date.now() - cached.ts < HISTORY_TTL) return cached
  try {
    const path = fund
      ? `/fund/history?proj_id=${encodeURIComponent(symbol)}&range=${RANGE_PARAM[range]}`
      : `/history?symbol=${encodeURIComponent(symbol)}&range=${RANGE_PARAM[range]}`
    const r = await api<{ currency: string; points: [number, number][] }>(path)
    const row = { key, points: r.points, currency: r.currency, ts: Date.now() }
    await db.history.put(row)
    return row
  } catch (e) {
    if (cached) return cached // stale cache is better than nothing offline
    throw e
  }
}

const toSeries = (points: [number, number][]): PriceSeries =>
  points.filter(([, c]) => c != null && Number.isFinite(c)).map(([t, c]) => [toISO(new Date(t * 1000)), c])

/** THB price series per asset id for the given range. Assets that fail are omitted (caller falls back). */
export async function loadHistory(assets: Asset[], range: Range) {
  const settings = await getSettings()
  const series: Record<string, PriceSeries> = {}
  const errors: string[] = []
  const fxCache: Record<string, PriceSeries> = {}
  const fxSeries = async (cur: string) => {
    if (cur === 'THB') return null
    if (!fxCache[cur]) fxCache[cur] = toSeries((await rawHistory(FX_SYMBOL[cur], range)).points)
    return fxCache[cur]
  }

  await Promise.all(
    assets.map(async (a) => {
      try {
        const h = await rawHistory(a.symbol, range, a.type === 'FUND')
        const s = toSeries(h.points)
        if (a.type === 'FUND' || a.symbol.endsWith('THB=X')) {
          series[a.id] = s
          return
        }
        const fx = await fxSeries(h.currency)
        series[a.id] = s.map(([d, c]) => {
          const rate = fx ? (priceAt(fx, d) ?? 0) : 1
          return [d, a.type === 'GOLD' ? goldUsdOzToThaiBaht(c, rate, settings.goldPremiumTHB) : c * rate]
        })
      } catch (e) {
        errors.push(`${a.name}: ${(e as Error).message}`)
      }
    }),
  )
  return { series, errors }
}
