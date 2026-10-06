import { useEffect } from 'react'
import { usePortfolio, useRefresh } from '../hooks'
import { AllocationDonut } from '../components/Charts'
import { fmtPct, fmtSigned, fmtTHB, fmtTime, plClass } from '../format'
import { HoldingRow } from './Holdings'

export function Dashboard({ onOpenAsset, onAdd }: { onOpenAsset: (id: string) => void; onAdd: () => void }) {
  const p = usePortfolio()
  const { refresh, loading, errors } = useRefresh()

  // auto refresh when prices are older than 5 minutes
  useEffect(() => {
    if (!p || !p.assets.length) return
    const missing = p.assets.some((a) => !p.priceMap.has(a.id))
    if (missing || Date.now() - p.lastUpdate > 5 * 60 * 1000) refresh().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.assets.length])

  if (!p) return null
  const s = p.summary
  const errCount = Object.keys(errors).length

  if (!p.assets.length)
    return (
      <div className="card text-center py-10 space-y-3">
        <div className="text-4xl">📈</div>
        <p className="font-medium">ยังไม่มีรายการลงทุน</p>
        <p className="text-sm text-muted">เริ่มบันทึกการซื้อครั้งแรก แอพจะคำนวณต้นทุนเฉลี่ยให้อัตโนมัติ</p>
        <button className="btn-primary" onClick={onAdd}>
          + เพิ่มรายการแรก
        </button>
      </div>
    )

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted">มูลค่าพอร์ตรวม</p>
            <p className="text-3xl font-semibold tabular mt-1">{fmtTHB(s.value)}</p>
          </div>
          <button className="btn-ghost text-sm px-3 py-1.5" onClick={refresh} disabled={loading}>
            {loading ? 'กำลังโหลด…' : '↻ ราคา'}
          </button>
        </div>
        <p className={`mt-1 tabular font-medium ${plClass(s.unrealizedPL)}`}>
          {fmtSigned(s.unrealizedPL)} ({fmtPct(s.unrealizedPct)})
        </p>
        <dl className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <div>
            <dt className="text-muted">ต้นทุนคงเหลือ</dt>
            <dd className="tabular font-medium">{fmtTHB(s.costBasis)}</dd>
          </div>
          <div>
            <dt className="text-muted">กำไรที่ขายแล้ว</dt>
            <dd className={`tabular font-medium ${plClass(s.realizedPL)}`}>{fmtSigned(s.realizedPL)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted">กำไร/ขาดทุนสุทธิ (รวมที่ขายแล้ว)</dt>
            <dd className={`tabular font-semibold text-base ${plClass(s.totalPL)}`}>{fmtSigned(s.totalPL)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted mt-3">
          {p.lastUpdate ? `อัปเดตราคา ${fmtTime(p.lastUpdate)}` : 'ยังไม่มีราคาล่าสุด'}
          {errCount > 0 && <span className="text-down"> · ดึงราคาไม่ได้ {errCount} รายการ</span>}
        </p>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">สัดส่วนสินทรัพย์</h2>
        <AllocationDonut data={s.allocation} />
      </section>

      <section className="card p-0">
        <h2 className="font-semibold px-4 pt-4 pb-2">สินทรัพย์</h2>
        <ul className="divide-y divide-line">
          {p.holdings
            .filter((h) => h.quantity > 0)
            .map((h) => (
              <HoldingRow key={h.asset.id} h={h} error={errors[h.asset.id]} onClick={() => onOpenAsset(h.asset.id)} />
            ))}
        </ul>
      </section>
    </div>
  )
}
