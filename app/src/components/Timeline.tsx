import { useMemo, useRef, useState } from 'react'
import { bothFlags, idxToDate, runs } from '../lib/engine'
import type { Dataset, Mission, Site } from '../lib/types'

const ROWS = [
  { key: 'sun', label: 'Sun', color: 'var(--color-sun)' },
  { key: 'earth', label: 'Earth', color: 'var(--color-earth)' },
  { key: 'both', label: 'Both', color: 'var(--color-both)' },
] as const

type Span = 'focus' | 'all'
const DAY = 24

/** Visible index range. "focus" shows ~3 months around the mission and only moves when the
 * mission leaves the view, so dragging the landing doesn't shift the ground under the pointer. */
function useWindow(ds: Dataset, mission: Mission, span: Span) {
  const n = ds.meta.count
  const perDay = DAY / ds.meta.stepHours
  const need = Math.round((mission.durationH / ds.meta.stepHours) + mission.slipDays * perDay)
  const len = Math.min(n, Math.max(90 * perDay, need + 30 * perDay))
  const place = (start: number) => {
    let w0 = Math.max(0, Math.round(start - 20 * perDay))
    if (w0 + len > n) w0 = n - len
    return [w0, w0 + len] as const
  }
  const [win, setWin] = useState(() => place(mission.startIdx))
  let [w0, w1] = win
  if (w1 - w0 !== len || mission.startIdx < w0 || mission.startIdx + need > w1) {
    ;[w0, w1] = place(mission.startIdx)
    if (w0 !== win[0] || w1 !== win[1]) setWin([w0, w1])
  }
  return span === 'all' ? ([0, n] as const) : ([w0, w1] as const)
}

function ticks(ds: Dataset, w0: number, w1: number) {
  const days = (w1 - w0) * ds.meta.stepHours / DAY
  const out: { i: number; label: string }[] = []
  if (days > 200) {
    // month starts, labelled "Jan" (with the year on January)
    const d = idxToDate(ds, w0)
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    for (; ; m.setUTCMonth(m.getUTCMonth() + (days > 500 ? 3 : 1))) {
      const i = Math.round((m.getTime() - Date.parse(ds.meta.start)) / (ds.meta.stepHours * 3600_000))
      if (i >= w1) break
      const mo = m.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
      out.push({ i, label: m.getUTCMonth() === 0 ? `${mo} ${m.getUTCFullYear()}` : mo })
    }
  } else {
    const step = Math.round((days > 60 ? 14 : 7) * DAY / ds.meta.stepHours)
    for (let i = w0 + step / 2; i < w1; i += step) {
      out.push({ i: Math.round(i), label: idxToDate(ds, i).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) })
    }
  }
  return out
}

export default function Timeline({ ds, site, mission, cursor, onLanding, onCursor }: {
  ds: Dataset
  site: Site
  mission: Mission
  cursor: number
  onLanding: (idx: number) => void
  onCursor: (idx: number) => void
}) {
  const n = ds.meta.count
  const [span, setSpan] = useState<Span>('focus')
  const [w0, w1] = useWindow(ds, mission, span)
  const W = w1 - w0
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
    return Math.max(0, Math.min(n - 1, Math.round(w0 + ((e.clientX - r.left) / r.width) * W)))
  }
  const tk = useMemo(() => ticks(ds, w0, w1), [ds, w0, w1])

  const rowH = 14, gap = 6, top = 4
  const H = top + ROWS.length * (rowH + gap)

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <div className="grid grid-cols-2 gap-0.5 rounded-[9px] bg-surface-2 p-[2px] text-xs" role="radiogroup" aria-label="Timeline range">
          {([['focus', 'Around mission'], ['all', 'All 2 years']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={span === v}
              onClick={() => setSpan(v)}
              className={`rounded-[7px] px-2.5 py-1 transition-[background-color,color,box-shadow] duration-150 ${span === v ? 'bg-surface font-medium text-ink shadow-control' : 'text-ink-2 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex w-12 shrink-0 flex-col pt-1 text-[11px] text-ink-3" style={{ gap: gap + 'px' }}>
          {ROWS.map((r) => (
            <div key={r.key} className="flex items-center gap-1.5" style={{ height: rowH }}>
              <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />{r.label}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <svg
            ref={ref}
            viewBox={`${w0} 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-[72px] w-full cursor-crosshair touch-none select-none"
            onPointerDown={(e) => { drag.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); onLanding(idxFromEvent(e)) }}
            onPointerMove={(e) => { if (drag.current) onLanding(idxFromEvent(e)) }}
            onPointerUp={() => { drag.current = false }}
            onDoubleClick={(e) => onCursor(idxFromEvent(e))}
          >
            {ROWS.map((r, ri) => (
              <g key={r.key} transform={`translate(0 ${top + ri * (rowH + gap)})`}>
                <rect x={w0} width={W} height={rowH} fill="var(--color-surface-2)" />
                {rowRuns[r.key].filter(([a, b]) => b > w0 && a < w1).map(([a, b]) => (
                  <rect key={a} x={a} width={b - a} height={rowH} fill={r.color} opacity={0.9} />
                ))}
              </g>
            ))}
            {slipN > 0 && (
              <rect x={mission.startIdx + slipN} y={0} width={durN} height={H} fill="var(--color-risk)" fillOpacity={0.12} stroke="var(--color-risk)" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
            )}
            <rect x={mission.startIdx} y={0} width={durN} height={H} fill="var(--ink)" fillOpacity={0.07} stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <line x1={cursor} x2={cursor} y1={0} y2={H} stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="relative h-4 text-[11px] text-ink-3 tabular">
            {tk.map((t) => (
              <span key={t.i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((t.i - w0) / W) * 100}%` }}>{t.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
