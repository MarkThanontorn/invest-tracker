import { useState } from 'react'
import { db, TYPE_LABEL } from '../db'
import { usePortfolio } from '../hooks'
import { fmtDate, fmtNum, fmtPct, fmtSigned, fmtTHB, fmtTime, plClass } from '../format'
import { UNIT } from './AddTransaction'

export function AssetDetail({
  assetId,
  onAdd,
  onEdit,
  onBack,
  onChart,
}: {
  assetId: string
  onAdd: () => void
  onEdit: (txId: string) => void
  onBack: () => void
  onChart: () => void
}) {
  const p = usePortfolio()
  const [editPrice, setEditPrice] = useState<string | null>(null)
  const h = p?.holdings.find((x) => x.asset.id === assetId)
  if (!h || !p) return null
  // resolved copies, so USD-funded trades show their current THB cost
  const txs = p.txs.filter((t) => t.assetId === assetId).sort((x, y) => (x.date < y.date ? 1 : -1))
  const a = h.asset
  const unit = UNIT[a.type]
  const cached = p?.priceMap.get(a.id)

  async function deleteAsset() {
    if (!confirm(`ลบ ${a.name} และธุรกรรมทั้งหมด ${txs!.length} รายการ?`)) return
    await db.transaction('rw', db.assets, db.transactions, db.prices, async () => {
      const own = await db.transactions.where({ assetId }).toArray()
      // trades of this asset take their automatic USD/USDT legs with them
      const legs = own.filter((t) => t.linkRole !== 'cash' && t.linkedTxId).map((t) => t.linkedTxId!)
      await db.transactions.bulkDelete(legs)
      // trades elsewhere that were paid from this cash asset keep their THB snapshot
      for (const t of own.filter((t) => t.linkRole === 'cash' && t.linkedTxId))
        await db.transactions.update(t.linkedTxId!, { linkedTxId: undefined })
      await db.transactions.where({ assetId }).delete()
      await db.prices.delete(assetId)
      await db.assets.delete(assetId)
    })
    onBack()
  }

  async function saveManual() {
    const v = Number(editPrice)
    await db.assets.update(a.id, { manualPrice: v > 0 ? v : undefined })
    setEditPrice(null)
  }

  return (
    <div className="space-y-4">
      <button className="text-sm text-accent" onClick={onBack}>
        ‹ กลับ
      </button>
      <section className="card">
        <p className="text-xs text-muted">
          {TYPE_LABEL[a.type]} · {a.symbol}
        </p>
        <h1 className="text-xl font-semibold">{a.name}</h1>
        <p className="text-2xl font-semibold tabular mt-2">{fmtTHB(h.value)}</p>
        <p className={`tabular font-medium ${plClass(h.unrealizedPL)}`}>
          {fmtSigned(h.unrealizedPL)} ({fmtPct(h.unrealizedPct)})
        </p>
        <dl className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <Stat label={`จำนวน (${unit})`} value={fmtNum(h.quantity)} />
          <Stat label="ต้นทุนเฉลี่ย" value={fmtTHB(h.avgCost, 4)} />
          <Stat label="ราคาปัจจุบัน" value={h.price != null ? fmtTHB(h.price, 4) : '—'} />
          <Stat label="ต้นทุนคงเหลือ" value={fmtTHB(h.costBasis)} />
          <Stat label="ลงทุนไปทั้งหมด" value={fmtTHB(h.totalBought)} />
          <Stat label="กำไรที่ขายแล้ว" value={fmtSigned(h.realizedPL)} cls={plClass(h.realizedPL)} />
        </dl>
        <p className="text-xs text-muted mt-3">
          {cached ? (cached.asOf ? `NAV ณ วันที่ ${fmtDate(cached.asOf)} (ดึงเมื่อ ${fmtTime(cached.ts)})` : `ราคาอัปเดต ${fmtTime(cached.ts)}`) : a.manualPrice ? 'ใช้ราคาที่กรอกเอง' : 'ยังไม่มีราคา'}
          {' · '}
          <button className="text-accent" onClick={() => setEditPrice(String(a.manualPrice ?? ''))}>
            กรอกราคาเอง
          </button>
        </p>
        {editPrice != null && (
          <div className="flex gap-2 mt-2">
            <input
              className="input tabular"
              inputMode="decimal"
              placeholder="ราคาต่อหน่วย (บาท) — เว้นว่างเพื่อลบ"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
            />
            <button className="btn-primary" onClick={saveManual}>
              ตกลง
            </button>
          </div>
        )}
        <p className="text-xs text-muted mt-1">ราคาที่กรอกเองจะใช้เมื่อดึงราคาอัตโนมัติไม่ได้</p>
      </section>

      <div className="flex gap-2">
        <button className="btn-primary flex-1" onClick={onAdd}>
          + ซื้อ/ขาย
        </button>
        <button className="btn-ghost flex-1" onClick={onChart}>
          ดูกราฟ
        </button>
      </div>

      <section className="card p-0">
        <h2 className="font-semibold px-4 pt-4 pb-2">ประวัติธุรกรรม</h2>
        <ul className="divide-y divide-line">
          {txs.map((t) => (
            <li key={t.id}>
              <button className="w-full text-left px-4 py-3 flex justify-between gap-3" onClick={() => onEdit(t.linkRole === 'cash' && t.linkedTxId ? t.linkedTxId : t.id)}>
                <div>
                  <span className={`text-xs font-semibold mr-2 ${t.side === 'BUY' ? 'text-up' : 'text-down'}`}>
                    {t.side === 'BUY' ? 'ซื้อ' : 'ขาย'}
                  </span>
                  <span className="text-sm">{fmtDate(t.date)}</span>
                  <div className="text-xs text-muted tabular">
                    {t.currency && t.priceFx != null ? (
                      <>
                        {fmtNum(t.quantity)} {unit} @ {fmtNum(t.priceFx, 4)} {t.currency}
                        {t.feeFx ? ` · ค่าธรรมเนียม ${fmtNum(t.feeFx, 2)} ${t.currency}` : ''}
                        {` · ${t.side === 'BUY' ? 'จ่ายด้วย' : 'รับเป็น'} ${t.currency}`}
                        {t.fxRate ? ` (฿${fmtNum(t.fxRate, 4)})` : ''}
                      </>
                    ) : (
                      <>
                        {fmtNum(t.quantity)} {unit} @ {fmtTHB(t.priceTHB, 4)}
                        {t.feeTHB ? ` · ค่าธรรมเนียม ${fmtTHB(t.feeTHB)}` : ''}
                      </>
                    )}
                  </div>
                  {t.note && (
                    <div className="text-xs text-muted">
                      {t.linkRole === 'cash' && <span className="mr-1 rounded bg-line px-1">อัตโนมัติ</span>}
                      {t.note}
                    </div>
                  )}
                </div>
                <div className="tabular font-medium text-sm text-right">
                  {fmtTHB(t.quantity * t.priceTHB + (t.side === 'BUY' ? t.feeTHB || 0 : -(t.feeTHB || 0)))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <button className="text-sm text-down w-full py-3" onClick={deleteAsset}>
        ลบสินทรัพย์นี้
      </button>
    </div>
  )
}

function Stat({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular font-medium ${cls}`}>{value}</dd>
    </div>
  )
}
