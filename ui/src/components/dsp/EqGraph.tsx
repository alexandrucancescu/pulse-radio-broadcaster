import { useMemo } from 'react'
import type { EqParams } from '../../hooks/useDsp'
import { computeResponse, logFreqPoints } from '../../lib/eq'

// Drawn in a fixed viewBox and scaled by the SVG; all numbers below are in
// that coordinate space, not pixels.
const W = 720
const H = 200
const PAD_L = 34
const PAD_R = 8
const PAD_T = 12
const PAD_B = 20
const DB_RANGE = 15 // vertical extent, ±dB

const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

const LOG_MIN = Math.log10(20)
const LOG_MAX = Math.log10(20000)

const xFor = (freq: number) => PAD_L + ((Math.log10(freq) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * PLOT_W
const yFor = (db: number) => PAD_T + PLOT_H / 2 - (db / DB_RANGE) * (PLOT_H / 2)

const GRID_FREQS = [
	{ f: 100, label: '100' },
	{ f: 1000, label: '1k' },
	{ f: 10000, label: '10k' },
]
const GRID_DB = [-12, -6, 0, 6, 12]

export default function EqGraph({ eq }: { eq: EqParams }) {
	const { linePath, areaPath } = useMemo(() => {
		const freqs = logFreqPoints(160)
		const response = eq.enabled ? computeResponse(eq, freqs) : freqs.map(() => 0)
		const clamp = (db: number) => Math.max(-DB_RANGE, Math.min(DB_RANGE, db))

		const pts = freqs.map((f, i) => `${xFor(f).toFixed(1)},${yFor(clamp(response[i])).toFixed(1)}`)
		const line = `M ${pts.join(' L ')}`
		const area = `${line} L ${xFor(20000).toFixed(1)},${yFor(0).toFixed(1)} L ${xFor(20).toFixed(1)},${yFor(0).toFixed(1)} Z`
		return { linePath: line, areaPath: area }
	}, [eq])

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="h-44 w-full"
			preserveAspectRatio="none"
			role="img"
			aria-label="Equalizer frequency response curve"
		>
			<defs>
				<linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
					<stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
				</linearGradient>
			</defs>

			{/* dB grid + labels */}
			{GRID_DB.map(db => (
				<g key={db}>
					<line
						x1={PAD_L}
						x2={W - PAD_R}
						y1={yFor(db)}
						y2={yFor(db)}
						stroke={db === 0 ? '#3f3f46' : '#27272a'}
						strokeWidth={db === 0 ? 1 : 0.75}
					/>
					<text x={PAD_L - 6} y={yFor(db) + 3} textAnchor="end" className="fill-zinc-600 text-[9px]">
						{db > 0 ? `+${db}` : db}
					</text>
				</g>
			))}

			{/* frequency gridlines + labels */}
			{GRID_FREQS.map(({ f, label }) => (
				<g key={f}>
					<line x1={xFor(f)} x2={xFor(f)} y1={PAD_T} y2={H - PAD_B} stroke="#27272a" strokeWidth={0.75} />
					<text x={xFor(f)} y={H - 6} textAnchor="middle" className="fill-zinc-600 text-[9px]">
						{label}
					</text>
				</g>
			))}

			{eq.enabled && <path d={areaPath} fill="url(#eqFill)" />}
			<path
				d={linePath}
				fill="none"
				stroke={eq.enabled ? '#60a5fa' : '#52525b'}
				strokeWidth={2}
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	)
}
