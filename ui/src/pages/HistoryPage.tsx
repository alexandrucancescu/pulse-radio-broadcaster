import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useHistory, type Range } from '../hooks/useHistory'
import Footer from '../components/Footer'
import DashboardTabs from '../components/DashboardTabs'

const RANGES: { value: Range; label: string }[] = [
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
]

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatTimeLabel(t: string, range: Range): string {
  if (range === '24h') {
    return t.slice(11, 16)
  }
  return t.slice(5, 10)
}

export default function HistoryPage() {
  const [range, setRange] = useState<Range>('7d')
  const { data, isLoading, error } = useHistory(range)

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Pulse Radio</h1>
          <Link to="/dsp" className="text-sm text-blue-400 hover:underline">
            Audio Processing →
          </Link>
        </div>

        <DashboardTabs active="history" />

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            Failed to load history: {error.message}
          </div>
        )}

        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                range === r.value
                  ? 'bg-blue-600 text-white'
                  : 'border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {isLoading || !data ? (
          <div className="py-20 text-center text-zinc-500">Loading...</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <StatCard label="Today" value={String(data.summary.today)} />
              <StatCard label="This week" value={String(data.summary.week)} />
              <StatCard label="This month" value={String(data.summary.month)} />
              <StatCard label="Avg duration" value={formatDuration(Math.round(data.summary.avgDurationS))} />
              <StatCard
                label="Peak concurrent"
                value={data.peakConcurrent ? String(data.peakConcurrent.peak) : '—'}
                sub={data.peakConcurrent ? new Date(data.peakConcurrent.at).toLocaleDateString() : undefined}
              />
            </div>

            {/* Listeners over time */}
            <ChartSection title="Listeners over time">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.listenersOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="t"
                    tickFormatter={(t) => formatTimeLabel(t, range)}
                    stroke="#71717a"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis stroke="#71717a" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    labelStyle={{ color: '#a1a1aa' }}
                    itemStyle={{ color: '#60a5fa' }}
                    labelFormatter={(t) => formatTimeLabel(t as string, range)}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.15}
                    name="Sessions"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartSection>

            {/* Average listeners by hour of day */}
            <ChartSection title="Average listeners by hour of day">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.listenersByHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
                    stroke="#71717a"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis stroke="#71717a" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    labelStyle={{ color: '#a1a1aa' }}
                    itemStyle={{ color: '#a78bfa' }}
                    labelFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
                  />
                  <Bar dataKey="avg" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Avg listeners" />
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Top countries */}
              <TableSection title="Top countries">
                {data.topCountries.map((c) => (
                  <RankRow key={c.country} label={c.country} value={String(c.count)} />
                ))}
                {data.topCountries.length === 0 && <EmptyRow />}
              </TableSection>

              {/* Top referers */}
              <TableSection title="Top referers">
                {data.topReferers.map((r) => (
                  <RankRow key={r.referer} label={r.referer} value={String(r.count)} />
                ))}
                {data.topReferers.length === 0 && <EmptyRow />}
              </TableSection>
            </div>

            {/* Top IPs by listening time */}
            <TableSection title="Top listeners by total listening time">
              {data.topIps.map((ip) => (
                <RankRow
                  key={ip.ip}
                  label={ip.ip}
                  value={formatDuration(ip.totalSeconds)}
                  sub={`${ip.sessions} session${ip.sessions !== 1 ? 's' : ''}`}
                />
              ))}
              {data.topIps.length === 0 && <EmptyRow />}
            </TableSection>
          </>
        )}

        <Footer />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  )
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-400">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function TableSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-400">{title}</h2>
      </div>
      <div className="divide-y divide-zinc-800">{children}</div>
    </div>
  )
}

function RankRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="truncate text-sm text-zinc-300">{label}</span>
      <div className="flex items-baseline gap-2">
        {sub && <span className="text-xs text-zinc-500">{sub}</span>}
        <span className="font-mono text-sm text-zinc-200">{value}</span>
      </div>
    </div>
  )
}

function EmptyRow() {
  return <div className="px-4 py-6 text-center text-sm text-zinc-500">No data yet</div>
}
