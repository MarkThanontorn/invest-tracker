import { db, getSettings, saveSettings, type Asset, type Settings, type Transaction } from './db'

export const BACKUP_APP = 'invest-tracker'
export const BACKUP_VERSION = 1

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  assets: Asset[]
  transactions: Transaction[]
  settings?: Settings
}

export async function buildBackup(includeSettings = true): Promise<Backup> {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    assets: await db.assets.toArray(),
    transactions: await db.transactions.toArray(),
    settings: includeSettings ? await getSettings() : undefined,
  }
}

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

export function parseBackup(text: string): Backup {
  let data: Backup
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง')
  }
  if (data?.app !== BACKUP_APP) throw new Error('ไม่ใช่ไฟล์สำรองของแอพนี้')
  if (!isNum(data.version) || data.version > BACKUP_VERSION) throw new Error('เวอร์ชันไฟล์ใหม่กว่าแอพ กรุณาอัปเดตแอพ')
  if (!Array.isArray(data.assets) || !Array.isArray(data.transactions)) throw new Error('ข้อมูลในไฟล์ไม่ครบ')
  const assetIds = new Set<string>()
  for (const a of data.assets) {
    if (typeof a.id !== 'string' || typeof a.symbol !== 'string' || typeof a.type !== 'string')
      throw new Error('ข้อมูลสินทรัพย์ผิดรูปแบบ')
    assetIds.add(a.id)
  }
  for (const t of data.transactions) {
    if (
      typeof t.id !== 'string' ||
      !assetIds.has(t.assetId) ||
      (t.side !== 'BUY' && t.side !== 'SELL') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
      !isNum(t.quantity) ||
      !isNum(t.priceTHB)
    )
      throw new Error('ข้อมูลธุรกรรมผิดรูปแบบ')
  }
  return data
}

export async function applyBackup(b: Backup, mode: 'replace' | 'merge') {
  await db.transaction('rw', db.assets, db.transactions, db.kv, db.prices, db.history, async () => {
    if (mode === 'replace') {
      await Promise.all([db.assets.clear(), db.transactions.clear(), db.prices.clear(), db.history.clear()])
    }
    await db.assets.bulkPut(b.assets)
    await db.transactions.bulkPut(b.transactions)
    if (b.settings && (mode === 'replace' || !(await getSettings()).workerUrl)) await saveSettings(b.settings)
  })
}

export async function exportBackup() {
  const b = await buildBackup()
  const name = `invest-backup-${b.exportedAt.slice(0, 10).replace(/-/g, '')}.json`
  const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' })
  const file = new File([blob], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportCsv() {
  const assets = new Map((await db.assets.toArray()).map((a) => [a.id, a]))
  const rows = (await db.transactions.orderBy('date').toArray()).map((t) => {
    const a = assets.get(t.assetId)
    return [t.date, a?.type, a?.symbol, a?.name, t.side, t.quantity, t.priceTHB, t.feeTHB, t.quantity * t.priceTHB, t.note ?? '']
  })
  const head = ['date', 'type', 'symbol', 'name', 'side', 'quantity', 'price_thb', 'fee_thb', 'amount_thb', 'note']
  const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `invest-transactions-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
}
