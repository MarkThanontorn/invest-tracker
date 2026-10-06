export const fmtTHB = (n: number, digits = 2) =>
  '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const fmtNum = (n: number, max = 8) => n.toLocaleString('th-TH', { maximumFractionDigits: max })

export const fmtPct = (n: number) => (n > 0 ? '+' : '') + n.toFixed(2) + '%'

export const fmtSigned = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtTHB(Math.abs(n))

export const plClass = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted')

export const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
