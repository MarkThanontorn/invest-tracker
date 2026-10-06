import { useEffect, useRef, useState } from 'react'
import { db, getSettings, saveSettings, DEFAULT_SETTINGS, type Settings as S } from '../db'
import { refreshPrices } from '../prices'
import { applyBackup, exportBackup, exportCsv, parseBackup, type Backup } from '../backup'

export function Settings() {
  const [s, setS] = useState<S>(DEFAULT_SETTINGS)
  const [msg, setMsg] = useState('')
  const [pending, setPending] = useState<Backup | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getSettings().then(setS)
    navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  async function save() {
    await saveSettings({ ...s, workerUrl: s.workerUrl.trim(), accessToken: s.accessToken.trim() })
    await db.prices.clear()
    await db.history.clear()
    setMsg('บันทึกแล้ว')
  }

  async function test() {
    setMsg('กำลังทดสอบ…')
    try {
      const res = await fetch(s.workerUrl.trim().replace(/\/$/, '') + '/quote?symbols=USDTHB%3DX', {
        headers: s.accessToken ? { 'X-Access-Token': s.accessToken.trim() } : {},
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? res.status)
      setMsg(`เชื่อมต่อสำเร็จ ✓ USD/THB = ${j.quotes['USDTHB=X']?.price ?? '?'}`)
    } catch (e) {
      setMsg('เชื่อมต่อไม่ได้: ' + (e as Error).message)
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      setPending(parseBackup(await f.text()))
      setMsg('')
    } catch (err) {
      setMsg('นำเข้าไม่ได้: ' + (err as Error).message)
    }
  }

  async function doImport(mode: 'replace' | 'merge') {
    if (!pending) return
    if (mode === 'replace' && !confirm('ข้อมูลเดิมในเครื่องนี้จะถูกแทนที่ทั้งหมด ยืนยัน?')) return
    await applyBackup(pending, mode)
    refreshPrices(await db.assets.toArray()).catch(() => {})
    setS(await getSettings())
    setMsg(`นำเข้าแล้ว ${pending.assets.length} สินทรัพย์, ${pending.transactions.length} ธุรกรรม`)
    setPending(null)
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="font-semibold">สำรอง / ย้ายเครื่อง</h2>
        <p className="text-sm text-muted">
          ข้อมูลเก็บในเครื่องนี้เท่านั้น ให้ Export ไฟล์ไว้เป็นระยะ (เช่น เก็บใน Files / Google Drive) และ Import ในเครื่องใหม่
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={() => exportBackup().catch((e) => setMsg(e.message))}>
            Export ไฟล์
          </button>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
            Import ไฟล์
          </button>
        </div>
        <button className="text-sm text-accent" onClick={exportCsv}>
          Export ธุรกรรมเป็น CSV (เปิดใน Excel)
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} />
        {pending && (
          <div className="rounded-xl border border-accent p-3 space-y-2">
            <p className="text-sm">
              ไฟล์จาก {new Date(pending.exportedAt).toLocaleString('th-TH')}: {pending.assets.length} สินทรัพย์,{' '}
              {pending.transactions.length} ธุรกรรม
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost text-sm" onClick={() => doImport('merge')}>
                รวมกับข้อมูลเดิม
              </button>
              <button className="btn-primary text-sm" onClick={() => doImport('replace')}>
                แทนที่ทั้งหมด
              </button>
            </div>
            <button className="text-sm text-muted w-full" onClick={() => setPending(null)}>
              ยกเลิก
            </button>
          </div>
        )}
        {persisted === false && (
          <p className="text-xs text-muted">
            แนะนำ: บน iPhone ให้ “เพิ่มไปยังหน้าจอโฮม” เพื่อให้ข้อมูลไม่ถูกลบอัตโนมัติ
          </p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">แหล่งราคา (Worker)</h2>
        <label className="block">
          <span className="label">Worker URL</span>
          <input
            className="input"
            placeholder="https://invest-price-proxy.xxx.workers.dev"
            value={s.workerUrl}
            onChange={(e) => setS({ ...s, workerUrl: e.target.value })}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        <label className="block">
          <span className="label">Access token</span>
          <input
            className="input"
            type="password"
            value={s.accessToken}
            onChange={(e) => setS({ ...s, accessToken: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="label">ส่วนต่างราคาทองไทย (บาท/บาททองคำ)</span>
          <input
            className="input tabular"
            inputMode="decimal"
            value={String(s.goldPremiumTHB)}
            onChange={(e) => setS({ ...s, goldPremiumTHB: Number(e.target.value) || 0 })}
          />
          <span className="text-xs text-muted">ราคาทองคำนวณจาก Spot โลก × USD/THB ปรับให้ใกล้ราคาสมาคมฯ ได้ที่นี่</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost" onClick={test}>
            ทดสอบ
          </button>
          <button className="btn-primary" onClick={save}>
            บันทึก
          </button>
        </div>
      </section>

      {msg && <p className="text-sm text-center">{msg}</p>}
      <p className="text-xs text-muted text-center">
        ส่งออกไปที่ Worker เฉพาะสัญลักษณ์ (เช่น PTT.BK) — ต้นทุนและจำนวนไม่ออกจากเครื่อง
      </p>
    </div>
  )
}
