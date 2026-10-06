import { useEffect, useState } from 'react'
import { Dashboard } from './pages/Dashboard'
import { Holdings } from './pages/Holdings'
import { AssetDetail } from './pages/AssetDetail'
import { AddTransaction } from './pages/AddTransaction'
import { ChartsPage } from './pages/ChartsPage'
import { Settings } from './pages/Settings'

type Tab = 'home' | 'assets' | 'add' | 'charts' | 'settings'
type View =
  | { tab: Tab }
  | { tab: 'assets'; assetId: string }
  | { tab: 'add'; assetId?: string; txId?: string }
  | { tab: 'charts'; assetId?: string }

const TABS: { tab: Tab; label: string; icon: string }[] = [
  { tab: 'home', label: 'ภาพรวม', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { tab: 'assets', label: 'สินทรัพย์', icon: 'M4 6h16M4 12h16M4 18h10' },
  { tab: 'add', label: 'เพิ่ม', icon: 'M12 5v14M5 12h14' },
  { tab: 'charts', label: 'กราฟ', icon: 'M4 19V5M4 19h16M8 15l4-4 3 3 5-6' },
  { tab: 'settings', label: 'ตั้งค่า', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z' },
]

const TITLE: Record<Tab, string> = {
  home: 'Invest Tracker',
  assets: 'สินทรัพย์',
  add: 'บันทึกการซื้อ/ขาย',
  charts: 'ผลการลงทุนย้อนหลัง',
  settings: 'ตั้งค่า',
}

export default function App() {
  const [view, setView] = useState<View>({ tab: 'home' })

  useEffect(() => {
    // ask the browser not to evict our IndexedDB
    navigator.storage?.persist?.().catch(() => {})
  }, [])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  const openAsset = (assetId: string) => setView({ tab: 'assets', assetId })

  let page
  if (view.tab === 'home') page = <Dashboard onOpenAsset={openAsset} onAdd={() => setView({ tab: 'add' })} />
  else if (view.tab === 'assets' && 'assetId' in view)
    page = (
      <AssetDetail
        assetId={view.assetId}
        onBack={() => setView({ tab: 'assets' })}
        onAdd={() => setView({ tab: 'add', assetId: view.assetId })}
        onEdit={(txId) => setView({ tab: 'add', assetId: view.assetId, txId })}
        onChart={() => setView({ tab: 'charts', assetId: view.assetId })}
      />
    )
  else if (view.tab === 'assets') page = <Holdings onOpenAsset={openAsset} />
  else if (view.tab === 'add') {
    const v = view as { assetId?: string; txId?: string }
    page = (
      <AddTransaction
        key={`${v.assetId}-${v.txId}`}
        assetId={v.assetId}
        txId={v.txId}
        onDone={(id) => setView(id ? { tab: 'assets', assetId: id } : { tab: 'home' })}
      />
    )
  } else if (view.tab === 'charts')
    page = (
      <ChartsPage
        assetId={(view as { assetId?: string }).assetId}
        onAssetChange={(assetId) => setView({ tab: 'charts', assetId })}
      />
    )
  else page = <Settings />

  return (
    <div className="min-h-dvh max-w-lg mx-auto flex flex-col">
      <header className="safe-top sticky top-0 z-10 bg-bg/90 backdrop-blur px-4">
        <h1 className="py-3 text-lg font-semibold">{TITLE[view.tab]}</h1>
      </header>
      <main className="flex-1 px-4 pb-28">{page}</main>
      <nav className="safe-bottom fixed bottom-0 inset-x-0 z-10 bg-card/95 backdrop-blur border-t border-line">
        <ul className="max-w-lg mx-auto grid grid-cols-5">
          {TABS.map((t) => {
            const active = view.tab === t.tab
            return (
              <li key={t.tab}>
                <button
                  className={`w-full flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] ${active ? 'text-accent' : 'text-muted'}`}
                  onClick={() => setView({ tab: t.tab })}
                >
                  {t.tab === 'add' ? (
                    <span className="w-9 h-9 -mt-1 rounded-full bg-accent text-white dark:text-slate-900 grid place-items-center">
                      <Icon d={t.icon} />
                    </span>
                  ) : (
                    <Icon d={t.icon} />
                  )}
                  {t.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
