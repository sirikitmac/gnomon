import { useMemo, useRef } from 'react'
import { bothFlags, idxToDate, runs } from '../lib/engine'
import type { Dataset, Mission, Site } from '../lib/types'

const ROWS = [
  { key: 'sun', label: 'Sun', color: 'var(--color-sun)' },
  { key: 'earth', label: 'Earth', color: 'var(--color-earth)' },
  { key: 'both', label: 'Both', color: 'var(--color-both)' },
] as const

export default function Timeline({ ds, site, mission, cursor, onLanding, onCursor }: {
  ds: Dataset
  site: Site
  mission: Mission
  cursor: number
  onLanding: (idx: number) => void
  onCursor: (idx: number) => void
}) {
  const n = ds.meta.count
  const ref = useRef<SVGSVGElement>(null)
  const drag = useRef(false)
  const rowRuns = useMemo(() => ({
    sun: runs(site.series.sunVis),
    earth: runs(site.series.earthVis),
    both: runs(bothFlags(site)),
  }), [site])

  const durN = mission.durationH / ds.meta.stepHours
  const slipN = (mission.slipDays * 24) / ds.meta.stepHours
  const idxFromEvent = (e: { clientX: number }) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * n)))
  }

  const rowH = 14, gap = 6, top = 4
  const H = top + ROWS.length * (rowH + gap) + 0

  return (
    <div className="flex gap-3">
      <div className="flex shrink-0 flex-col pt-1 text-[11px] text-ink-500" style={{ gap: gap + 'px' }}>
        {ROWS.map((r) => (
          <div key={r.key} className="flex items-center gap-1.5" style={{ height: rowH }}>
            <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />{r.label}
          </div>
        ))}
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${n} ${H}`}
        preserveAspectRatio="none"
        className="h-[72px] w-full cursor-crosshair touch-none select-none"
        onPointerDown={(e) => { drag.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); onLanding(idxFromEvent(e)) }}
        onPointerMove={(e) => { if (drag.current) onLanding(idxFromEvent(e)) }}
        onPointerUp={() => { drag.current = false }}
        onDoubleClick={(e) => onCursor(idxFromEvent(e))}
      >
        {ROWS.map((r, ri) => (
          <g key={r.key} transform={`translate(0 ${top + ri * (rowH + gap)})`}>
            <rect width={n} height={rowH} fill="var(--color-space-800)" rx={2} />
            {rowRuns[r.key].map(([a, b]) => (
              <rect key={a} x={a} width={b - a} height={rowH} fill={r.color} opacity={0.85} />
            ))}
          </g>
        ))}
        {/* slipped ghost */}
        {slipN > 0 && (
          <rect x={mission.startIdx + slipN} y={0} width={durN} height={H} fill="var(--color-risk)" fillOpacity={0.12} stroke="var(--color-risk)" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
        )}
        {/* mission box */}
        <rect x={mission.startIdx} y={0} width={durN} height={H} fill="white" fillOpacity={0.08} stroke="white" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {/* cursor */}
        <line x1={cursor} x2={cursor} y1={0} y2={H} stroke="white" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

export function TimelineAxis({ ds }: { ds: Dataset }) {
  const n = ds.meta.count
  const ticks: { i: number; label: string }[] = []
  for (let i = 0; i < n; i += Math.round(24 / ds.meta.stepHours) * 14) {
    ticks.push({ i, label: idxToDate(ds, i).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) })
  }
  return (
    <div className="relative ml-[58px] h-4 text-[11px] text-ink-500 tabular">
      {ticks.map((t) => (
        <span key={t.i} className="absolute -translate-x-1/2" style={{ left: `${(t.i / n) * 100}%` }}>{t.label}</span>
      ))}
    </div>
  )
}
