import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  uid,
  TYPE_LABEL,
  CASH_ASSET,
  cashOptions,
  isCashAsset,
  type Asset,
  type AssetType,
  type CashCurrency,
  type Transaction,
} from '../db'
import { computePosition, resolveTransactions } from '../calc'
import { DEFAULT_SYMBOL, refreshPrices, usdThbOn } from '../prices'
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

type PayCur = 'THB' | CashCurrency
const fmtCur = (n: number, cur: PayCur, d = 2) =>
  cur === 'THB' ? fmtTHB(n, d) : `${n.toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d })} ${cur}`

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
  const [payCur, setPayCur] = useState<PayCur>('THB')
  const [rate, setRate] = useState('')
  const [rateTouched, setRateTouched] = useState(false)
  const [legId, setLegId] = useState<string | undefined>()
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
      setNote(t.note ?? '')
      setLegId(t.linkedTxId)
      if (t.currency) {
        setPayCur(t.currency)
        setMoney(String(t.priceFx ?? ''))
        setFee(t.feeFx ? String(t.feeFx) : '')
        if (t.fxRate) {
          setRate(String(t.fxRate))
          setRateTouched(true)
        }
      } else {
        setMoney(String(t.priceTHB))
        setFee(t.feeTHB ? String(t.feeTHB) : '')
      }
    })
  }, [txId])

  const asset = assets?.find((a) => a.id === assetId)
  const type: AssetType | null = asset?.type ?? newType
  const symbol = asset?.symbol ?? newAsset?.symbol ?? ''
  const options = type ? cashOptions({ type, symbol }) : []
  const foreign = payCur !== 'THB' && options.includes(payCur) ? payCur : null
  const cashAsset = foreign ? assets?.find((a) => isCashAsset(a, foreign)) : undefined

  const held = useLiveQuery(
    async () => (assetId ? computePosition((await db.transactions.where({ assetId }).toArray()).filter((t) => t.id !== txId)).quantity : 0),
    [assetId, txId],
  )
  // cash available on the trade date (excluding this trade's own leg when editing), with its average THB cost
  const cash = useLiveQuery(async () => {
    if (!cashAsset) return null
    const all = resolveTransactions((await db.transactions.toArray()).filter((t) => t.id !== txId && t.id !== legId))
    return computePosition(
      all.filter((t) => t.assetId === cashAsset.id),
      date,
    )
  }, [cashAsset?.id, date, txId, legId])

  // prefill the exchange rate when selling into USD/USDT
  useEffect(() => {
    if (!foreign || side !== 'SELL' || rateTouched) return
    let off = false
    usdThbOn(date)
      .then((r) => !off && r && setRate(r.toFixed(4)))
      .catch(() => {})
    return () => {
      off = true
    }
  }, [foreign, side, date, rateTouched])

  const cur: PayCur = foreign ?? 'THB'
  const q = num(qty)
  const m = num(money)
  const f = num(fee) || 0
  const price = mode === 'amount' ? (q > 0 ? m / q : 0) : m
  const gross = mode === 'amount' ? m : q * m
  const sellRate = num(rate)
  // THB per 1 unit of the settlement currency
  const thbRate = !foreign ? 1 : side === 'BUY' ? (cash?.avgCost ?? 0) : sellRate
  const cashSpent = gross + f // BUY: total USD leaving the cash position
  const cashReceived = gross - f // SELL: USD added to the cash position
  const ready = useMemo(() => !!(asset || (newType && newAsset)), [asset, newType, newAsset])

  async function ensureAsset(): Promise<string> {
    if (asset) return asset.id
    const existing = assets?.find((a) => a.type === newType && a.symbol === newAsset!.symbol)
    if (existing) return existing.id
    const a: Asset = { id: uid(), type: newType!, symbol: newAsset!.symbol, name: newAsset!.name, createdAt: new Date().toISOString() }
    await db.assets.add(a)
    refreshPrices([a]).catch(() => {})
    return a.id
  }

  async function ensureCashAsset(c: CashCurrency): Promise<string> {
    if (cashAsset) return cashAsset.id
    const a: Asset = { id: uid(), ...CASH_ASSET[c], createdAt: new Date().toISOString() }
    await db.assets.add(a)
    refreshPrices([a]).catch(() => {})
    return a.id
  }

  async function save() {
    setError('')
    if (!(q > 0)) return setError('กรอกจำนวนให้ถูกต้อง')
    if (!(m > 0)) return setError(mode === 'amount' ? `กรอกจำนวนเงิน (${cur})` : `กรอกราคาต่อหน่วย (${cur})`)
    if (side === 'SELL' && q > (held ?? 0) + 1e-9) return setError(`ขายได้ไม่เกิน ${fmtNum(held ?? 0)} ${UNIT[type!]}`)
    if (foreign && side === 'BUY') {
      if (!cashAsset || !cash || cash.quantity <= 0) return setError(`ยังไม่มี ${foreign} ในพอร์ต ณ วันที่นี้ — บันทึกการซื้อ ${foreign} ก่อน`)
      if (cashSpent > cash.quantity + 1e-9)
        return setError(`${foreign} ไม่พอ: ต้องใช้ ${fmtCur(cashSpent, foreign)} มีอยู่ ${fmtCur(cash.quantity, foreign)}`)
    }
    if (foreign && side === 'SELL' && !(sellRate > 0)) return setError('กรอกอัตราแลกเปลี่ยน')
    if (foreign && side === 'SELL' && !(cashReceived > 0)) return setError('ค่าธรรมเนียมมากกว่ายอดขาย')

    const id = await ensureAsset()
    const mainId = txId ?? uid()
    const name = asset?.name ?? newAsset!.name
    const cashId = foreign ? await ensureCashAsset(foreign) : ''

    await db.transaction('rw', db.transactions, async () => {
      if (!foreign) {
        if (legId) await db.transactions.delete(legId) // switched back to THB
        await db.transactions.put({
          id: mainId,
          assetId: id,
          side,
          date,
          quantity: q,
          priceTHB: price,
          feeTHB: f,
          note: note.trim() || undefined,
        })
        return
      }
      const leg = legId ?? uid()
      const main: Transaction = {
        id: mainId,
        assetId: id,
        side,
        date,
        quantity: q,
        // THB values are a snapshot; BUY values are re-resolved from the cash average on read
        priceTHB: price * thbRate,
        feeTHB: f * thbRate,
        note: note.trim() || undefined,
        currency: foreign,
        priceFx: price,
        feeFx: f,
        fxRate: side === 'SELL' ? sellRate : undefined,
        linkedTxId: leg,
      }
      const cashLeg: Transaction = {
        id: leg,
        assetId: cashId,
        side: side === 'BUY' ? 'SELL' : 'BUY',
        date,
        quantity: side === 'BUY' ? cashSpent : cashReceived,
        priceTHB: thbRate,
        feeTHB: 0,
        note: `${side === 'BUY' ? 'ใช้ซื้อ' : 'รับจากขาย'} ${name}`,
        linkedTxId: mainId,
        linkRole: 'cash',
      }
      await db.transactions.bulkPut([main, cashLeg])
    })
    onDone(id)
  }

  // wait for assets before deciding which step to show (avoids flashing the asset picker)
  if (!assets || (txId && !assetId)) return null

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
          <p className="text-xs text-muted mt-2">BTC, USDT และคริปโตอื่นเลือกที่ “คริปโต”</p>
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
            {TYPE_LABEL[type!]} · {symbol}
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

      {options.length > 0 && (
        <div>
          <span className="label">{side === 'BUY' ? 'จ่ายด้วย' : 'รับเงินเป็น'}</span>
          <div className="flex gap-2">
            {(['THB', ...options] as PayCur[]).map((c) => (
              <button
                key={c}
                className={`flex-1 rounded-xl border py-2 text-sm font-medium ${cur === c ? 'border-accent text-accent' : 'border-line text-muted'}`}
                onClick={() => setPayCur(c)}
              >
                {c === 'THB' ? 'เงินบาท' : `${c} ในพอร์ต`}
              </button>
            ))}
          </div>
          {foreign && side === 'BUY' && (
            <p className="text-xs text-muted mt-1 tabular">
              {cash === undefined
                ? 'กำลังตรวจยอด…'
                : cash && cash.quantity > 0
                ? `มี ${fmtCur(cash.quantity, foreign)} · ต้นทุนเฉลี่ย ${fmtTHB(cash.avgCost, 4)}/${foreign}`
                : `ยังไม่มี ${foreign} ในพอร์ต ณ วันที่นี้`}
            </p>
          )}
          {foreign && side === 'SELL' && (
            <p className="text-xs text-muted mt-1">เงินที่ได้จะเข้าไปเป็น {foreign} ในพอร์ต</p>
          )}
        </div>
      )}

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
            {foreign ? `ยอดรวม (${foreign})` : 'เงินบาทรวม'}
          </button>
          <button className={mode === 'price' ? 'text-accent font-medium' : 'text-muted'} onClick={() => setMode('price')}>
            ราคาต่อ{unit === 'USD' ? ' 1 USD' : 'หน่วย'} ({foreign ?? 'บาท'})
          </button>
        </div>
        <input className="input tabular" inputMode="decimal" placeholder="0.00" value={money} onChange={(e) => setMoney(e.target.value)} />
        {q > 0 && m > 0 && (
          <p className="text-xs text-muted mt-1 tabular">
            {mode === 'amount' ? `= ${fmtCur(price, cur, 4)} ต่อ${unit}` : `= รวม ${fmtCur(gross, cur)}`}
          </p>
        )}
      </div>

      <label className="block">
        <span className="label">ค่าธรรมเนียม ({foreign ?? 'บาท'})</span>
        <input className="input tabular" inputMode="decimal" placeholder="0" value={fee} onChange={(e) => setFee(e.target.value)} />
      </label>

      {foreign && side === 'SELL' && (
        <label className="block">
          <span className="label">อัตราแลกเปลี่ยน (บาท ต่อ 1 {foreign})</span>
          <input
            className="input tabular"
            inputMode="decimal"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value)
              setRateTouched(true)
            }}
          />
          <span className="text-xs text-muted">เติมให้จากอัตรา USD/THB วันนั้น แก้ได้ · ใช้เป็นต้นทุนของ {foreign} ที่ได้รับ</span>
        </label>
      )}

      {foreign && q > 0 && m > 0 && thbRate > 0 && (
        <div className="rounded-xl bg-line/40 p-3 text-sm tabular space-y-0.5">
          {side === 'BUY' ? (
            <>
              <div>
                ใช้ {fmtCur(cashSpent, foreign)} จากพอร์ต
              </div>
              <div className="text-muted">
                ต้นทุนเป็นเงินบาท ≈ {fmtTHB(cashSpent * thbRate)} (ตามต้นทุนเฉลี่ย {foreign} {fmtTHB(thbRate, 4)})
              </div>
            </>
          ) : (
            <>
              <div>
                ได้รับ {fmtCur(cashReceived, foreign)} เข้าพอร์ต
              </div>
              <div className="text-muted">≈ {fmtTHB(cashReceived * thbRate)}</div>
            </>
          )}
        </div>
      )}

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
            if (!confirm(legId ? `ลบธุรกรรมนี้? (รายการ ${cur} ที่ผูกกันจะถูกลบด้วย)` : 'ลบธุรกรรมนี้?')) return
            await db.transactions.bulkDelete(legId ? [txId, legId] : [txId])
            onDone(assetId)
          }}
        >
          ลบธุรกรรมนี้
        </button>
      )}
    </div>
  )
}
