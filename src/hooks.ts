import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import { db } from './db'
import { computeHolding, resolveTransactions, summarize, type Holding } from './calc'
import { refreshPrices } from './prices'

export function usePortfolio() {
  const data = useLiveQuery(async () => {
    const [assets, rawTxs, prices] = await Promise.all([db.assets.toArray(), db.transactions.toArray(), db.prices.toArray()])
    const txs = resolveTransactions(rawTxs)
    const priceMap = new Map(prices.map((p) => [p.key, p]))
    const holdings: Holding[] = assets.map((a) =>
      computeHolding(
        a,
        txs.filter((t) => t.assetId === a.id),
        priceMap.get(a.id)?.priceTHB ?? null,
      ),
    )
    holdings.sort((a, b) => b.value - a.value)
    const lastUpdate = prices.reduce((m, p) => Math.max(m, p.ts), 0)
    return { assets, txs, holdings, summary: summarize(holdings), lastUpdate, priceMap }
  }, [])
  return data
}

export function useRefresh() {
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setErrors(await refreshPrices(await db.assets.toArray()))
    } finally {
      setLoading(false)
    }
  }, [])
  return { refresh, loading, errors }
}
