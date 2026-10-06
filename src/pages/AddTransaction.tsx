import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, TYPE_LABEL, type Asset, type AssetType, type Transaction } from '../db'
import { computePosition } from '../calc'
import { DEFAULT_SYMBOL, refreshPrices } from '../prices'
import { SymbolPicker } from '../components/SymbolPicker'
import { fmtNum, fmtTHB } from '../format'

export const UNIT: Record<AssetType, string> = {
  USD: 'USD',
  GOLD: 'บาททองคำ',
  CRYPTO: 'เหรียญ',
  TH_STOCK: 'หุ้น',
  US_STOCK: 'หุ้น',
  CN_STOCK: 'หุ้น',
  FUND: 'หน่วย',
}

const today = () => new Date().toLocaleDateString('sv-SE') // yyyy-mm-dd in local time
const num = (s: string) => Number(s.replace(/,/g, ''))

export function AddTransaction({
  assetId: initialAssetId,
  txId,
  onDone,
}: {
  assetId?: string
  txId?: string
  onDone: (assetId?: string) => void
}) {
  const assets = useLiveQuery(() => db.assets.toArray(), [])
  const [assetId, setAssetId] = useState(initialAssetId)
  const [newType, setNewType] = useState<AssetType | null>(null)
  const [newAsset, setNewAsset] = useState<{ symbol: string; name: string } | null>(null)

  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY')
  const [date, setDate] = useState(today())
  const [qty, setQty] = useState('')
  const [mode, setMode] = useState<'amount' | 'price'>('amount')
  const [money, setMoney] = useState('')
  const [fee, setFee] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  // editing an existing transaction
  useEffect(() => {
    if (!txId) return
    db.transactions.get(txId).then((t) => {
      if (!t) return
      setAssetId(t.assetId)
      setSide(t.side)
      setDate(t.date)
      setQty(String(t.quantity))
      setMode('price')
      setMoney(String(t.priceTHB))
      setFee(t.feeTHB ? String(t.feeTHB) : '')
      setNote(t.note ?? '')
    })
  }, [txId])

  const asset = assets?.find((a) => a.id === assetId)
  const type: AssetType | null = asset?.type ?? newType
  const held = useLiveQuery(
    async () => (assetId ? computePosition((await db.transactions.where({ assetId }).toArray()).filter((t) => t.id !== txId)).quantity : 0),
    [assetId, txId],
  )

  const q = num(qty)
  const m = num(money)
  const price = mode === 'amount' ? (q > 0 ? m / q : 0) : m
  const total = mode === 'amount' ? m : q * m
  const ready = useMemo(() => !!(asset || (newType && newAsset)), [asset, newType, newAsset])

  async function save() {
    setError('')
    if (!(q > 0)) return setError('กรอกจำนวนให้ถูกต้อง')
    if (!(m > 0)) return setError(mode === 'amount' ? 'กรอกจำนวนเงินบาท' : 'กรอกราคาต่อหน่วย')
    if (side === 'SELL' && q > (held ?? 0) + 1e-9) return setError(`ขายได้ไม่เกิน ${fmtNum(held ?? 0)} ${UNIT[type!]}`)

    let id = assetId
    if (!asset && newType && newAsset) {
      const existing = assets?.find((a) => a.type === newType && a.symbol === newAsset.symbol)
      if (existing) id = existing.id
      else {
        const a: Asset = { id: uid(), type: newType, symbol: newAsset.symbol, name: newAsset.name, createdAt: new Date().toISOString() }
        await db.assets.add(a)
        id = a.id
        refreshPrices([a]).catch(() => {})
      }
    }
    const t: Transaction = {
      id: txId ?? uid(),
      assetId: id!,
      side,
      date,
      quantity: q,
      priceTHB: price,
      feeTHB: num(fee) || 0,
      note: note.trim() || undefined,
    }
    await db.transactions.put(t)
    onDone(id)
  }

  // ---- step 1: choose asset ----
  if (!ready) {
    if (newType) {
      return (
        <div className="space-y-4">
          <button className="text-sm text-accent" onClick={() => setNewType(null)}>
            ‹ เปลี่ยนประเภท
          </button>
          <h2 className="font-semibold">ค้นหา {TYPE_LABEL[newType]}</h2>
          <SymbolPicker type={newType} onPick={(r) => setNewAsset({ symbol: r.symbol, name: r.name })} />
        </div>
      )
    }
    return (
      <div className="space-y-5">
        {!!assets?.length && (
          <section>
            <h2 className="label">สินทรัพย์ที่มีอยู่</h2>
            <div className="flex flex-wrap gap-2">
              {assets.map((a) => (
                <button key={a.id} className="btn-ghost text-sm py-2" onClick={() => setAssetId(a.id)}>
                  {a.name}
                </button>
              ))}
            </div>
          </section>
        )}
        <section>
          <h2 className="label">สินทรัพย์ใหม่</h2>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TYPE_LABEL) as AssetType[]).map((t) => (
              <button
                key={t}
                className="btn-ghost text-left"
                onClick={() => {
                  setNewType(t)
                  const d = DEFAULT_SYMBOL[t]
                  if (d && t !== 'CRYPTO') setNewAsset(d)
                }}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">BTC และคริปโตอื่นเลือกที่ “คริปโต”</p>
        </section>
      </div>
    )
  }

  // ---- step 2: transaction form ----
  const unit = UNIT[type!]
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">{asset?.name ?? newAsset?.name}</div>
          <div className="text-xs text-muted">
            {TYPE_LABEL[type!]} · {asset?.symbol ?? newAsset?.symbol}
            {!!held && ` · ถืออยู่ ${fmtNum(held)} ${unit}`}
          </div>
        </div>
        {!txId && !initialAssetId && (
          <button
            className="text-sm text-accent"
            onClick={() => {
              setAssetId(undefined)
              setNewType(null)
              setNewAsset(null)
            }}
          >
            เปลี่ยน
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-line/50">
        {(['BUY', 'SELL'] as const).map((s) => (
          <button
            key={s}
            className={`rounded-lg py-2 font-medium ${side === s ? (s === 'BUY' ? 'bg-up text-white' : 'bg-down text-white') : 'text-muted'}`}
            onClick={() => setSide(s)}
          >
            {s === 'BUY' ? 'ซื้อ' : 'ขาย'}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="label">วันที่</span>
        <input type="date" className="input" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      </label>

      <label className="block">
        <span className="label">จำนวน ({unit})</span>
        <input className="input tabular" inputMode="decimal" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>

      <div>
        <div className="flex gap-3 text-sm mb-1">
          <button className={mode === 'amount' ? 'text-accent font-medium' : 'text-muted'} onClick={() => setMode('amount')}>
            เงินบาทรวม
          </button>
          <button className={mode === 'price' ? 'text-accent font-medium' : 'text-muted'} onClick={() => setMode('price')}>
            ราคาต่อ{unit === 'USD' ? ' 1 USD' : 'หน่วย'} (บาท)
          </button>
        </div>
        <input className="input tabular" inputMode="decimal" placeholder="0.00" value={money} onChange={(e) => setMoney(e.target.value)} />
        {q > 0 && m > 0 && (
          <p className="text-xs text-muted mt-1 tabular">
            {mode === 'amount' ? `= ${fmtTHB(price, 4)} ต่อ${unit}` : `= รวม ${fmtTHB(total)}`}
          </p>
        )}
      </div>

      <label className="block">
        <span className="label">ค่าธรรมเนียม (บาท)</span>
        <input className="input tabular" inputMode="decimal" placeholder="0" value={fee} onChange={(e) => setFee(e.target.value)} />
      </label>

      <label className="block">
        <span className="label">บันทึก</span>
        <input className="input" placeholder="ไม่บังคับ" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {error && <p className="text-down text-sm">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={() => onDone(assetId)}>
          ยกเลิก
        </button>
        <button className="btn-primary flex-[2]" onClick={save}>
          บันทึก
        </button>
      </div>
      {txId && (
        <button
          className="text-sm text-down w-full py-2"
          onClick={async () => {
            if (!confirm('ลบธุรกรรมนี้?')) return
            await db.transactions.delete(txId)
            onDone(assetId)
          }}
        >
          ลบธุรกรรมนี้
        </button>
      )}
    </div>
  )
}
