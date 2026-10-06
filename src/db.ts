import Dexie, { type Table } from 'dexie'

export type AssetType = 'USD' | 'GOLD' | 'CRYPTO' | 'TH_STOCK' | 'US_STOCK' | 'CN_STOCK' | 'FUND'

export interface Asset {
  id: string
  type: AssetType
  /** Yahoo symbol (e.g. PTT.BK, AAPL, BTC-USD) or SEC proj_id for funds */
  symbol: string
  name: string
  /** Manual price in THB per unit; used when no live price is available */
  manualPrice?: number
  createdAt: string
}

export interface Transaction {
  id: string
  assetId: string
  side: 'BUY' | 'SELL'
  /** yyyy-mm-dd */
  date: string
  quantity: number
  /** price per unit in THB */
  priceTHB: number
  feeTHB: number
  note?: string
}

export interface PriceCache {
  /** asset id */
  key: string
  priceTHB: number
  ts: number
  /** date the price refers to (yyyy-mm-dd), e.g. a fund's NAV date */
  asOf?: string
}

export interface HistoryCache {
  /** `${symbol}|${range}` */
  key: string
  points: [number, number][] // [unix seconds, close in quote currency]
  currency: string
  ts: number
}

export interface Settings {
  workerUrl: string
  accessToken: string
  goldPremiumTHB: number
}

export const DEFAULT_SETTINGS: Settings = { workerUrl: '', accessToken: '', goldPremiumTHB: 0 }

class InvestDB extends Dexie {
  assets!: Table<Asset, string>
  transactions!: Table<Transaction, string>
  prices!: Table<PriceCache, string>
  history!: Table<HistoryCache, string>
  kv!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('invest-tracker')
    this.version(1).stores({
      assets: 'id, type, symbol',
      transactions: 'id, assetId, date',
      prices: 'key',
      history: 'key',
      kv: 'key',
    })
  }
}

export const db = new InvestDB()

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings')
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
}

export async function saveSettings(s: Settings) {
  await db.kv.put({ key: 'settings', value: s })
}

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

export const TYPE_LABEL: Record<AssetType, string> = {
  USD: 'ดอลลาร์ US',
  GOLD: 'ทองคำ',
  CRYPTO: 'คริปโต',
  TH_STOCK: 'หุ้นไทย',
  US_STOCK: 'หุ้น US',
  CN_STOCK: 'หุ้นจีน/HK',
  FUND: 'กองทุนไทย',
}

/** Allocation groups shown on the dashboard */
export type Group = 'USD' | 'Gold' | 'Crypto' | 'Stock' | 'Fund'
export const GROUP_OF: Record<AssetType, Group> = {
  USD: 'USD',
  GOLD: 'Gold',
  CRYPTO: 'Crypto',
  TH_STOCK: 'Stock',
  US_STOCK: 'Stock',
  CN_STOCK: 'Stock',
  FUND: 'Fund',
}
export const GROUP_LABEL: Record<Group, string> = {
  USD: 'US Dollar',
  Gold: 'ทองคำ',
  Crypto: 'BTC / Crypto',
  Stock: 'หุ้น',
  Fund: 'กองทุน',
}
