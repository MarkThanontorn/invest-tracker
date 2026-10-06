import { useEffect, useState } from 'react'
import type { AssetType } from '../db'
import { searchFunds, searchSymbols, type SearchResult } from '../prices'

const HINT: Partial<Record<AssetType, string>> = {
  TH_STOCK: 'เช่น PTT, CPALL, AOT (จะใช้ .BK)',
  US_STOCK: 'เช่น AAPL, NVDA, VOO',
  CN_STOCK: 'เช่น 0700.HK, 9988.HK, 600519.SS',
  CRYPTO: 'เช่น BTC-USD, ETH-USD',
  FUND: 'ชื่อย่อกองทุน เช่น K-USA, SCBS&P500',
}

/** Filter search results to the selected market */
function matchType(type: AssetType, r: SearchResult) {
  const s = r.symbol
  switch (type) {
    case 'TH_STOCK':
      return s.endsWith('.BK')
    case 'CN_STOCK':
      return /\.(SS|SZ|HK)$/.test(s)
    case 'US_STOCK':
      return !s.includes('.') && !s.includes('=') && r.type !== 'CRYPTOCURRENCY'
    case 'CRYPTO':
      return r.type === 'CRYPTOCURRENCY'
    default:
      return true
  }
}

export function SymbolPicker({ type, onPick }: { type: AssetType; onPick: (r: SearchResult) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    const id = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        if (type === 'FUND') setResults(await searchFunds(term))
        else {
          const query = type === 'TH_STOCK' && !term.includes('.') ? `${term}.BK` : term
          setResults((await searchSymbols(query)).filter((r) => matchType(type, r)))
        }
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => clearTimeout(id)
  }, [q, type])

  const manual = q.trim().toUpperCase()
  return (
    <div>
      <input
        className="input"
        placeholder={HINT[type] ?? 'ค้นหาสัญลักษณ์'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoCapitalize="characters"
        autoCorrect="off"
      />
      {loading && <p className="text-sm text-muted mt-2">กำลังค้นหา…</p>}
      {error && <p className="text-sm text-down mt-2">{error}</p>}
      <ul className="mt-2 divide-y divide-line">
        {results.map((r) => (
          <li key={r.symbol}>
            <button type="button" className="w-full text-left py-2.5" onClick={() => onPick({ ...r, name: r.symbol.endsWith('.BK') ? r.name.replace(/^[^_]+_/, '') || r.name : r.name })}>
              <div className="font-medium">{r.type === 'FUND' ? r.name : r.symbol}</div>
              <div className="text-sm text-muted truncate">
                {r.type === 'FUND' ? r.exchange : <>{r.name} {r.exchange && `· ${r.exchange}`}</>}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {manual.length >= 2 && type !== 'FUND' && (
        <button
          type="button"
          className="text-sm text-accent mt-1"
          onClick={() => onPick({ symbol: type === 'TH_STOCK' && !manual.includes('.') ? manual + '.BK' : manual, name: manual })}
        >
          ใช้ “{type === 'TH_STOCK' && !manual.includes('.') ? manual + '.BK' : manual}” โดยตรง
        </button>
      )}
    </div>
  )
}
