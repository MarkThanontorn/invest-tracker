import { useEffect, useState } from 'react'
import { usePortfolio } from '../hooks'
import { buildHistory, dateGrid, type HistoryPoint, type Range } from '../calc'
import { loadHistory } from '../prices'
import { PerformanceChart } from '../components/Charts'
import { fmtPct, fmtSigned, fmtTHB, plClass } from '../format'

const RANGES: Range[] = ['3M', '1Y', '3Y']
const RANGE_LABEL: Record<Range, string> = { '3M': '3 เดือน', '1Y': '1 ปี', '3Y': '3 ปี' }

export function ChartsPage({ assetId, onAssetChange }: { assetId?: string; onAssetChange: (id?: string) => void }) {
  const p = usePortfolio()
  const [range, setRange] = useState<Range>('1Y')
  const [points, setPoints] = useState<HistoryPoint[] | null>(null)
  const [perAsset, setPerAsset] = useState<{ id: string; name: string; pl: number; pct: number }[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const txKey = p ? p.txs.length + ':' + p.assets.length : ''
  useEffect(() => {
    if (!p) return
    let cancelled = false
    const assets = assetId ? p.assets.filter((a) => a.id === assetId) : p.assets
    const txs = p.txs.filter((t) => assets.some((a) => a.id === t.assetId))
    setLoading(true)
    loadHistory(assets, range).then(({ series, errors }) => {
      if (cancelled) return
      const grid = dateGrid(range)
      setPoints(buildHistory(assets, txs, series, grid))
      // P/L contribution of each asset over the range
      setPerAsset(
        assets
          .map((a) => {
            const pts = buildHistory([a], txs.filter((t) => t.assetId === a.id), series, grid)
            const first = pts[0]
            const last = pts[pts.length - 1]
            const plAt = (x: HistoryPoint) => x.value - x.costBasis + x.realizedPL
            return { id: a.id, name: a.name, pl: plAt(last) - plAt(first), pct: last.twr }
          })
          .filter((x) => Math.abs(x.pl) > 0.005)
          .sort((a, b) => b.pl - a.pl),
      )
      setErrors(errors)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, assetId, txKey])

  if (!p) return null
  const first = points?.[0]
  const last = points?.[points.length - 1]
  const plAt = (x: HistoryPoint) => x.value - x.costBasis + x.realizedPL
  const plChange = first && last ? plAt(last) - plAt(first) : 0

  return (
    <div className="space-y-4">
      <select className="input" value={assetId ?? ''} onChange={(e) => onAssetChange(e.target.value || undefined)}>
        <option value="">ทั้งพอร์ต</option>
        {p.assets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-line/50">
        {RANGES.map((r) => (
          <button
            key={r}
            className={`rounded-lg py-2 text-sm font-medium ${range === r ? 'bg-card shadow-sm' : 'text-muted'}`}
            onClick={() => setRange(r)}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <section className="card">
        {last && (
          <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
            <div>
              <p className="text-muted">ผลตอบแทน {RANGE_LABEL[range]}</p>
              <p className={`text-xl font-semibold tabular ${plClass(last.twr)}`}>{fmtPct(last.twr)}</p>
            </div>
            <div>
              <p className="text-muted">กำไร/ขาดทุนในช่วงนี้</p>
              <p className={`text-xl font-semibold tabular ${plClass(plChange)}`}>{fmtSigned(plChange)}</p>
            </div>
            <div>
              <p className="text-muted">มูลค่าต้นช่วง</p>
              <p className="tabular">{fmtTHB(first!.value, 0)}</p>
            </div>
            <div>
              <p className="text-muted">มูลค่าปัจจุบัน</p>
              <p className="tabular">{fmtTHB(last.value, 0)}</p>
            </div>
          </div>
        )}
        {loading && !points ? <p className="text-muted text-sm py-20 text-center">กำลังโหลดกราฟ…</p> : points && <PerformanceChart points={points} />}
        <p className="text-xs text-muted mt-2">
          ผลตอบแทนแบบ time-weighted (ไม่นับเงินที่เติมเข้ามาเป็นกำไร){loading && ' · กำลังอัปเดต…'}
        </p>
        {errors.length > 0 && (
          <p className="text-xs text-down mt-1">ไม่มีราคาย้อนหลัง (ใช้ราคาซื้อแทน): {errors.join(', ')}</p>
        )}
      </section>

      {!assetId && perAsset.length > 0 && (
        <section className="card p-0">
          <h2 className="font-semibold px-4 pt-4 pb-2">กำไร/ขาดทุนรายสินทรัพย์ ({RANGE_LABEL[range]})</h2>
          <ul className="divide-y divide-line">
            {perAsset.map((x) => (
              <li key={x.id}>
                <button className="w-full px-4 py-3 flex justify-between text-sm" onClick={() => onAssetChange(x.id)}>
                  <span>{x.name}</span>
                  <span className={`tabular ${plClass(x.pl)}`}>
                    {fmtSigned(x.pl)} · {fmtPct(x.pct)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
