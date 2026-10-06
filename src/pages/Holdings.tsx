import { useState } from 'react'
import type { Holding } from '../calc'
import { TYPE_LABEL } from '../db'
import { usePortfolio } from '../hooks'
import { UNIT } from './AddTransaction'
import { fmtNum, fmtPct, fmtSigned, fmtTHB, plClass } from '../format'

export function HoldingRow({ h, onClick, error }: { h: Holding; onClick: () => void; error?: string }) {
  return (
    <li>
      <button className="w-full text-left px-4 py-3 flex gap-3 items-center" onClick={onClick}>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{h.asset.name}</div>
          <div className="text-xs text-muted truncate">
            {fmtNum(h.quantity, 6)} {UNIT[h.asset.type]} · เฉลี่ย {fmtTHB(h.avgCost)}
            {error && <span className="text-down"> · ⚠</span>}
          </div>
        </div>
        <div className="text-right tabular">
          <div className="font-medium">{fmtTHB(h.value, 0)}</div>
          <div className={`text-xs ${plClass(h.unrealizedPL)}`}>
            {fmtSigned(h.unrealizedPL)} · {fmtPct(h.unrealizedPct)}
          </div>
        </div>
      </button>
    </li>
  )
}

export function Holdings({ onOpenAsset }: { onOpenAsset: (id: string) => void }) {
  const p = usePortfolio()
  const [showClosed, setShowClosed] = useState(false)
  if (!p) return null
  const open = p.holdings.filter((h) => h.quantity > 0)
  const closed = p.holdings.filter((h) => h.quantity <= 0)
  const byType = Object.entries(TYPE_LABEL)
    .map(([type, label]) => ({ label, items: open.filter((h) => h.asset.type === type) }))
    .filter((g) => g.items.length)

  return (
    <div className="space-y-4">
      {!open.length && <p className="text-muted text-center py-10">ยังไม่มีสินทรัพย์ที่ถืออยู่</p>}
      {byType.map((g) => (
        <section key={g.label} className="card p-0">
          <h2 className="px-4 pt-3 pb-1 text-sm font-semibold text-muted">
            {g.label} · {fmtTHB(g.items.reduce((s, h) => s + h.value, 0), 0)}
          </h2>
          <ul className="divide-y divide-line">
            {g.items.map((h) => (
              <HoldingRow key={h.asset.id} h={h} onClick={() => onOpenAsset(h.asset.id)} />
            ))}
          </ul>
        </section>
      ))}
      {closed.length > 0 && (
        <section className="card p-0">
          <button className="px-4 py-3 text-sm text-muted w-full text-left" onClick={() => setShowClosed(!showClosed)}>
            {showClosed ? '▾' : '▸'} ขายหมดแล้ว ({closed.length})
          </button>
          {showClosed && (
            <ul className="divide-y divide-line">
              {closed.map((h) => (
                <li key={h.asset.id}>
                  <button className="w-full text-left px-4 py-3 flex justify-between" onClick={() => onOpenAsset(h.asset.id)}>
                    <span>{h.asset.name}</span>
                    <span className={`tabular text-sm ${plClass(h.realizedPL)}`}>{fmtSigned(h.realizedPL)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
