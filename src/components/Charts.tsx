import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Legend,
} from 'chart.js'
import { Doughnut, Line } from 'react-chartjs-2'
import type { Group } from '../db'
import { GROUP_LABEL } from '../db'
import { fmtTHB, fmtDate } from '../format'
import type { HistoryPoint } from '../calc'

ChartJS.register(ArcElement, Tooltip, LineElement, PointElement, LinearScale, CategoryScale, Filler, Legend)

export const GROUP_COLOR: Record<Group, string> = {
  USD: '#0ea5e9',
  Gold: '#eab308',
  Crypto: '#f97316',
  Stock: '#6366f1',
  Fund: '#14b8a6',
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export function AllocationDonut({ data }: { data: { group: Group; value: number; pct: number }[] }) {
  if (!data.length) return null
  return (
    <div className="flex items-center gap-4">
      <div className="w-36 h-36 shrink-0">
        <Doughnut
          data={{
            labels: data.map((d) => GROUP_LABEL[d.group]),
            datasets: [
              {
                data: data.map((d) => d.value),
                backgroundColor: data.map((d) => GROUP_COLOR[d.group]),
                borderColor: css('--color-card'),
                borderWidth: 2,
              },
            ],
          }}
          options={{
            cutout: '68%',
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (c) => ` ${fmtTHB(c.parsed as number, 0)}` } },
            },
          }}
        />
      </div>
      <ul className="flex-1 space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.group} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: GROUP_COLOR[d.group] }} />
            <span className="flex-1">{GROUP_LABEL[d.group]}</span>
            <span className="tabular font-medium">{d.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PerformanceChart({ points }: { points: HistoryPoint[] }) {
  const accent = css('--color-accent')
  const muted = css('--color-muted')
  const line = css('--color-line')
  return (
    <div className="h-64">
      <Line
        data={{
          labels: points.map((p) => p.date),
          datasets: [
            {
              label: 'มูลค่าพอร์ต',
              data: points.map((p) => p.value),
              borderColor: accent,
              backgroundColor: accent + '22',
              fill: true,
              pointRadius: 0,
              borderWidth: 2,
              tension: 0.2,
            },
            {
              label: 'ต้นทุน',
              data: points.map((p) => p.costBasis),
              borderColor: muted,
              borderDash: [4, 4],
              pointRadius: 0,
              borderWidth: 1.5,
              stepped: true,
            },
          ],
        }}
        options={{
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: muted, boxWidth: 12, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                title: (items) => fmtDate(items[0].label),
                label: (c) => ` ${c.dataset.label}: ${fmtTHB(c.parsed.y ?? 0, 0)}`,
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color: muted,
                maxTicksLimit: 4,
                maxRotation: 0,
                autoSkipPadding: 16,
                callback(v) {
                  return fmtMonth(this.getLabelForValue(v as number))
                },
              },
              grid: { display: false },
            },
            y: {
              ticks: { color: muted, maxTicksLimit: 5, callback: (v) => compact(Number(v)) },
              grid: { color: line },
            },
          },
        }}
      />
    </div>
  )
}

const fmtMonth = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })

const compact = (n: number) =>
  Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : n.toFixed(0)
