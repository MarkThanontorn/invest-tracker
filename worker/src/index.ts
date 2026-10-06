/**
 * Personal price proxy for invest-tracker.
 * Only ticker symbols pass through here — no holdings or cost data is ever sent.
 *
 * Secrets / vars (wrangler secret put ...):
 *   ACCESS_TOKEN     shared secret the app sends in X-Access-Token (recommended)
 *   ALLOWED_ORIGIN   comma-separated origins allowed by CORS, e.g. https://you.github.io (default *)
 *   SEC_API_KEY      subscription key from https://secopendata.sec.or.th (Thai mutual funds, API v2)
 *   SEC_API_BASE     optional override of the SEC API base URL (default https://api.sec.or.th)
 */
export interface Env {
  ACCESS_TOKEN?: string
  ALLOWED_ORIGIN?: string
  SEC_API_KEY?: string
  SEC_API_BASE?: string
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
const YAHOO = 'https://query1.finance.yahoo.com'
const YAHOO_SEARCH = 'https://query2.finance.yahoo.com/v1/finance/search'

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = (env.ALLOWED_ORIGIN ?? '*').split(',').map((s) => s.trim())
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Access-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** fetch with Cloudflare edge cache */
async function cachedFetch(url: string, init: RequestInit, ttl: number): Promise<Response> {
  return fetch(url, { ...init, cf: { cacheTtl: ttl, cacheEverything: true } } as RequestInit)
}

async function yahooChart(symbol: string, range: string, interval: string) {
  const url = `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`
  const res = await cachedFetch(url, { headers: { 'User-Agent': UA } }, range === '1d' ? 60 : 3600)
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, `yahoo ${res.status} for ${symbol}`)
  const json: any = await res.json()
  const r = json?.chart?.result?.[0]
  if (!r) throw new HttpError(404, `no data for ${symbol}`)
  return r
}

async function quote(symbols: string[]) {
  const quotes: Record<string, { price: number; currency: string; time: number } | null> = {}
  await Promise.all(
    symbols.slice(0, 40).map(async (s) => {
      try {
        const r = await yahooChart(s, '1d', '1d')
        quotes[s] = { price: r.meta.regularMarketPrice, currency: r.meta.currency, time: r.meta.regularMarketTime }
      } catch {
        quotes[s] = null
      }
    }),
  )
  return { quotes }
}

async function history(symbol: string, range: string) {
  const interval = range === '3y' || range === '5y' ? '1wk' : '1d'
  const r = await yahooChart(symbol, range, interval)
  const ts: number[] = r.timestamp ?? []
  const close: (number | null)[] = r.indicators?.adjclose?.[0]?.adjclose ?? r.indicators?.quote?.[0]?.close ?? []
  const points = ts.map((t, i) => [t, close[i]]).filter(([, c]) => c != null)
  return { symbol, currency: r.meta.currency, points }
}

async function search(q: string) {
  const url = `${YAHOO_SEARCH}?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&listsCount=0`
  const res = await cachedFetch(url, { headers: { 'User-Agent': UA } }, 86400)
  if (!res.ok) throw new HttpError(502, `yahoo search ${res.status}`)
  const json: any = await res.json()
  const results = (json.quotes ?? [])
    .filter((x: any) => x.symbol)
    .map((x: any) => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol, exchange: x.exchDisp, type: x.quoteType }))
  return { results }
}

// ---------- SEC Thailand (mutual funds) ----------

function secHeaders(env: Env) {
  if (!env.SEC_API_KEY) throw new HttpError(501, 'ยังไม่ได้ตั้ง SEC_API_KEY ใน Worker')
  return { 'Ocp-Apim-Subscription-Key': env.SEC_API_KEY }
}

const SEC_BASE = (env: Env) => (env.SEC_API_BASE ?? 'https://api.sec.or.th').replace(/\/$/, '')

async function secGet(env: Env, path: string, params: Record<string, string>, ttl: number): Promise<any> {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ''))
  const res = await cachedFetch(`${SEC_BASE(env)}${path}?${qs}`, { headers: secHeaders(env) }, ttl)
  if (res.status === 204 || res.status === 404) return { items: [], next_cursor: '' }
  if (res.status === 401 || res.status === 403) throw new HttpError(502, 'SEC API key ไม่ถูกต้อง หรือยังไม่ได้ subscribe')
  if (!res.ok) throw new HttpError(502, `sec ${res.status}`)
  return res.json()
}

/**
 * Fund symbol format: "<proj_id>|<fund_class_name>" (class is empty for non-class funds).
 * Old symbols without "|" are treated as proj_id only.
 */
const parseFund = (symbol: string) => {
  const [projId, cls = ''] = symbol.split('|')
  return { projId, cls }
}

async function fundSearch(env: Env, q: string) {
  const j = await secGet(env, '/v2/fund/general-info/profiles', { project_info: q, page_size: '100' }, 86400)
  const items: any[] = (j.items ?? []).filter((f: any) => f.fund_status === 'Registered' || f.fund_status === 'IPO')
  const results = items.slice(0, 30).map((f) => {
    const cls = f.fund_class_name && f.fund_class_name !== '-' && f.fund_class_name !== 'main' ? f.fund_class_name : ''
    return {
      symbol: `${f.proj_id}|${cls}`,
      name: cls || f.proj_abbr_name,
      exchange: [f.proj_abbr_name !== cls ? f.proj_abbr_name : '', f.fund_class_detail || f.proj_name_th].filter(Boolean).join(' · '),
      type: 'FUND',
    }
  })
  return { results }
}

const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)

/** All NAV rows for one fund (class) between two dates, following next_cursor pagination. */
async function navRange(env: Env, symbol: string, start: string, end: string, ttl: number) {
  const { projId, cls } = parseFund(symbol)
  const rows: { date: string; nav: number }[] = []
  let cursor = ''
  for (let page = 0; page < 20; page++) {
    const j = await secGet(
      env,
      '/v2/fund/daily-info/nav',
      { proj_id: projId, fund_class_name: cls, start_nav_date: start, end_nav_date: end, page_size: '100', next_cursor: cursor },
      ttl,
    )
    for (const it of j.items ?? []) {
      const c = it.fund_class_name ?? ''
      // for non-class funds keep only the main series
      if (!cls && c && c !== '-' && c !== 'main') continue
      if (typeof it.last_val === 'number' && it.last_val > 0) rows.push({ date: it.nav_date, nav: it.last_val })
    }
    cursor = j.next_cursor ?? ''
    if (!cursor) break
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1))
  return rows
}

async function fundNav(env: Env, symbol: string) {
  const rows = await navRange(env, symbol, isoDaysAgo(14), isoDaysAgo(0), 1800)
  const last = rows[rows.length - 1]
  return last ? { nav: last.nav, date: last.date } : { nav: null, date: null }
}

async function fundHistory(env: Env, symbol: string, range: string) {
  const days = range === '3y' ? 1095 : range === '1y' ? 365 : 91
  const rows = await navRange(env, symbol, isoDaysAgo(days), isoDaysAgo(0), 6 * 3600)
  const points = rows.map((r) => [Math.floor(Date.parse(r.date + 'T00:00:00Z') / 1000), r.nav])
  return { symbol, currency: 'THB', points }
}

// ---------- router ----------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env)
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

    try {
      if (env.ACCESS_TOKEN && req.headers.get('X-Access-Token') !== env.ACCESS_TOKEN) throw new HttpError(401, 'unauthorized')
      const url = new URL(req.url)
      const p = url.searchParams
      const need = (k: string) => {
        const v = p.get(k)?.trim()
        if (!v) throw new HttpError(400, `missing ${k}`)
        return v
      }
      const range = (p.get('range') ?? '1y').match(/^(3mo|6mo|1y|3y|5y)$/)?.[0] ?? '1y'

      switch (url.pathname) {
        case '/':
          return json({ ok: true })
        case '/quote':
          return json(await quote(need('symbols').split(',').map((s) => s.trim()).filter(Boolean)))
        case '/history':
          return json(await history(need('symbol'), range))
        case '/search':
          return json(await search(need('q')))
        case '/fund/search':
          return json(await fundSearch(env, need('q')))
        case '/fund/nav':
          return json(await fundNav(env, need('proj_id')))
        case '/fund/history':
          return json(await fundHistory(env, need('proj_id'), range))
        default:
          throw new HttpError(404, 'not found')
      }
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      return json({ error: (e as Error).message }, status)
    }
  },
}
