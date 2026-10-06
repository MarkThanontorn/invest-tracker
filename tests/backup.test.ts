import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db, saveSettings } from '../src/db'
import { applyBackup, buildBackup, parseBackup } from '../src/backup'

describe('backup round-trip', () => {
  it('export -> clear -> import restores everything', async () => {
    await db.assets.add({ id: 'a1', type: 'CRYPTO', symbol: 'BTC-USD', name: 'Bitcoin', createdAt: '2025-01-01' })
    await db.transactions.bulkAdd([
      { id: 't1', assetId: 'a1', side: 'BUY', date: '2025-01-01', quantity: 0.01, priceTHB: 3_000_000, feeTHB: 50 },
      { id: 't2', assetId: 'a1', side: 'SELL', date: '2025-03-01', quantity: 0.005, priceTHB: 3_200_000, feeTHB: 20 },
    ])
    await saveSettings({ workerUrl: 'https://w.example', accessToken: 'x', goldPremiumTHB: 0 })
    const text = JSON.stringify(await buildBackup())
    await db.assets.clear()
    await db.transactions.clear()
    await applyBackup(parseBackup(text), 'replace')
    expect(await db.assets.count()).toBe(1)
    expect((await db.transactions.get('t2'))?.priceTHB).toBe(3_200_000)
  })
  it('merge dedupes by id', async () => {
    const b = parseBackup(JSON.stringify(await buildBackup()))
    await applyBackup(b, 'merge')
    expect(await db.transactions.count()).toBe(2)
  })
  it('rejects invalid files', () => {
    expect(() => parseBackup('nope')).toThrow()
    expect(() => parseBackup('{"app":"other"}')).toThrow()
    expect(() =>
      parseBackup(JSON.stringify({ app: 'invest-tracker', version: 1, assets: [], transactions: [{ id: 't', assetId: 'zz' }] })),
    ).toThrow()
  })
})
