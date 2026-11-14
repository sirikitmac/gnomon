import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { fmtDate, fmtHours, idxToDate } from '../lib/engine'
import { prefersReducedMotion } from '../lib/dom'
import { compassPoints, exaggeration, fovFor, skyRange, skylineAt, SKY_CAP_DEG, wrap180 } from '../lib/sky'
import type { Analysis, Dataset, Site } from '../lib/types'

type Center = 'sun' | 'earth' | 'north'

// The Moon has no atmosphere, so the sky is black in both themes; these colours are fixed on purpose.
const SKY = { top: '#000000', bottom: '#07080d', ground: '#1c1c20', groundDeep: '#0e0e10', ridge: '#6b6b73', lit: '#e8d6a8', text: '#a2adc2', grid: 'rgba(162,173,194,0.16)' }

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(800)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** First-person 360° view from the site: skyline silhouette, with the Sun and Earth at the mission time cursor. */
export default function SkyView({ ds, site, a, cursor, onCursor }: {
  ds: Dataset
  site: Site
  a: Analysis
  cursor: number
  onCursor: (i: number) => void
}) {
  const [box, W] = useWidth<HTMLDivElement>()
  const [center, setCenter] = useState<Center>('sun')
  const [playing, setPlaying] = useState(false)
  const uid = useId().replace(/:/g, '')
  const s = site.series

  const H = W < 600 ? 230 : 290
  const padB = 22
  const plotH = H - padB
  const fov = fovFor(W)
  const { elMin, elMax } = useMemo(() => skyRange(site, a), [site, a])
  const ex = exaggeration(W, fov, plotH, elMin, elMax)
  const pxDeg = W / fov
  const centerAz = center === 'sun' ? s.sunAz[cursor] : center === 'earth' ? s.earthAz[cursor] : 0
  const x = (az: number) => W / 2 + wrap180(az - centerAz) * pxDeg
  const y = (el: number) => plotH * (1 - (Math.min(el, elMax) - elMin) / (elMax - elMin))

  // Skyline silhouette across the visible field, sampled every ~3 px.
  const ground = (() => {
    const step = Math.max(0.25, 3 / pxDeg)
    const pts: string[] = []
    for (let off = -fov / 2 - step; off <= fov / 2 + step; off += step) {
      const px = W / 2 + off * pxDeg
      pts.push(`${px.toFixed(1)},${(plotH * (1 - (skylineAt(site.skyline, centerAz + off) - elMin) / (elMax - elMin))).toFixed(1)}`)
    }
    return pts
  })()

  // Faint path of each body over the whole mission.
  const track = (az: number[], el: number[]) => {
    const n = a.endIdx - a.startIdx
    const step = Math.max(1, Math.floor(n / 240))
    const out: { x: number; y: number }[] = []
    for (let i = a.startIdx; i < a.endIdx; i += step) {
      const px = x(az[i])
      if (px < -10 || px > W + 10 || el[i] > SKY_CAP_DEG) continue
      out.push({ x: px, y: y(el[i]) })
    }
    return out
  }

  // Playback: walk the shared mission-time cursor through the mission, looping.
  const live = useRef({ cursor, a, onCursor })
  useEffect(() => { live.current = { cursor, a, onCursor } })
  useEffect(() => {
    if (!playing) return
    const reduced = prefersReducedMotion()
    let pos = live.current.cursor
    let last = performance.now()
    let raf = 0
    let timer = 0
    const advance = (by: number) => {
      const { a: an, onCursor: set, cursor: now } = live.current
      if (Math.abs(now - Math.floor(pos)) > 1) pos = now // scrubbed elsewhere (e.g. the Timeline slider): follow it
      pos += by
      if (pos >= an.endIdx - 1) pos = an.startIdx
      if (pos < an.startIdx) pos = an.startIdx
      if (Math.floor(pos) !== live.current.cursor) set(Math.floor(pos))
    }
    if (reduced) {
      // Reduced motion: discrete 6-hour steps instead of continuous scrolling.
      timer = window.setInterval(() => advance(6 / ds.meta.stepHours), 500)
    } else {
      const tick = (t: number) => {
        const n = live.current.a.endIdx - live.current.a.startIdx
        const perSec = Math.max(4, n / 14) // whole mission in ~14 s
        advance(((t - last) / 1000) * perSec)
        last = t
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    return () => { cancelAnimationFrame(raf); clearInterval(timer) }
  }, [playing, ds])

  const sunUp = !!s.sunVis[cursor]
  const earthUp = !!s.earthVis[cursor]
  const bodies = [
    { key: 'sun', name: 'Sun', az: s.sunAz[cursor], el: s.sunEl[cursor], up: sunUp, r: 8, glow: 34, color: '#ffd27a' },
    { key: 'earth', name: 'Earth', az: s.earthAz[cursor], el: s.earthEl[cursor], up: earthUp, r: 6.5, glow: 18, color: '#4e9fff' },
  ]
  const sunTrack = track(s.sunAz, s.sunEl)
  const earthTrack = track(s.earthAz, s.earthEl)
  const gridStep = elMax - elMin > 16 ? 5 : elMax - elMin > 8 ? 2 : 1
  const grid: number[] = []
  for (let e = Math.ceil(elMin / gridStep) * gridStep; e <= elMax; e += gridStep) grid.push(e)
  const exLabel = ex >= 1.05 ? `Vertical scale exaggerated ×${ex < 10 ? ex.toFixed(1) : Math.round(ex)}` : 'Vertical scale ×1 (true)'

  const status = (b: (typeof bodies)[number]) => {
    const ridge = skylineAt(site.skyline, b.az)
    const el = `${b.el.toFixed(1)}°`
    if (b.up) return `${b.name} in view: at ${el}, above the ${ridge.toFixed(1)}° skyline`
    return `${b.name} hidden: at ${el}, behind the ${ridge.toFixed(1)}° skyline`
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={playing}
          className="flex min-h-9 items-center gap-2 rounded-[8px] bg-accent px-3 py-1.5 text-[13px] font-medium text-on-accent shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_0.5px_0_rgba(255,255,255,0.25)] transition-[transform,filter] duration-100 hover:brightness-105 active:scale-[0.97]"
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden><rect x="3" y="2.5" width="3" height="9" rx="0.8" /><rect x="8" y="2.5" width="3" height="9" rx="0.8" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden><path d="M4 2.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1L4.9 2.1a.6.6 0 0 0-.9.5Z" /></svg>
          )}
          {playing ? 'Pause' : 'Play mission'}
        </button>
        <div className="grid grid-cols-3 gap-0.5 rounded-[9px] bg-surface-2 p-[2px] text-xs" role="radiogroup" aria-label="Look towards">
          {([['sun', 'Follow Sun'], ['earth', 'Follow Earth'], ['north', 'North']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={center === v}
              onClick={() => setCenter(v)}
              className={`rounded-[7px] px-2.5 py-1 transition-[background-color,color,box-shadow] duration-150 ${center === v ? 'bg-surface font-medium text-ink shadow-control' : 'text-ink-2 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs tabular text-ink-3">{fmtDate(idxToDate(ds, cursor))} · T+{fmtHours((cursor - a.startIdx) * ds.meta.stepHours)}</span>
      </div>

      <div ref={box} className="relative overflow-hidden rounded-[12px] bg-black">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={`View from ${site.name}. ${status(bodies[0])}. ${status(bodies[1])}.`}>
          <defs>
            <linearGradient id={`${uid}-sky`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={SKY.top} />
              <stop offset="1" stopColor={SKY.bottom} />
            </linearGradient>
            <linearGradient id={`${uid}-ground`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={SKY.ground} />
              <stop offset="1" stopColor={SKY.groundDeep} />
            </linearGradient>
            {bodies.map((b) => (
              <radialGradient key={b.key} id={`${uid}-${b.key}`}>
                <stop offset="0" stopColor={b.color} stopOpacity={0.55} />
                <stop offset="0.35" stopColor={b.color} stopOpacity={0.18} />
                <stop offset="1" stopColor={b.color} stopOpacity={0} />
              </radialGradient>
            ))}
          </defs>
          <rect width={W} height={H} fill={`url(#${uid}-sky)`} />

          {grid.map((e) => <line key={e} x1={0} x2={W} y1={y(e)} y2={y(e)} stroke={SKY.grid} strokeDasharray="1 5" />)}

          {sunTrack.map((p, i) => <circle key={'s' + i} cx={p.x} cy={p.y} r={1.1} fill="#ffd27a" opacity={0.28} />)}
          {earthTrack.map((p, i) => <circle key={'e' + i} cx={p.x} cy={p.y} r={1.1} fill="#4e9fff" opacity={0.3} />)}

          {/* Bodies before the terrain, so ridges cover them when they're behind it. */}
          {bodies.map((b) => {
            const px = x(b.az)
            if (px < -40 || px > W + 40) return null
            const capped = b.el > elMax
            const py = capped ? b.r + 20 : y(b.el)
            return (
              <g key={b.key} opacity={b.up ? 1 : 0.4}>
                {b.up && <circle cx={px} cy={py} r={b.glow} fill={`url(#${uid}-${b.key})`} />}
                <circle cx={px} cy={py} r={b.r} fill={b.color} />
                {b.key === 'earth' && <circle cx={px} cy={py} r={b.r} fill="none" stroke="#cfe3ff" strokeOpacity={0.5} strokeWidth={0.8} />}
                <text x={px} y={py - b.r - 6} fontSize={11} textAnchor="middle" fill={SKY.text}>
                  {b.name}{capped ? ` ${b.el.toFixed(0)}° ↑` : ''}
                </text>
              </g>
            )
          })}

          <polygon
            points={`${ground[0].split(',')[0]},${H} ${ground.join(' ')} ${ground[ground.length - 1].split(',')[0]},${H}`}
            fill={`url(#${uid}-ground)`}
          />
          <polyline points={ground.join(' ')} fill="none" stroke={sunUp ? SKY.lit : SKY.ridge} strokeOpacity={sunUp ? 0.7 : 0.8} strokeWidth={1.2} strokeLinejoin="round" />

          {/* Scale labels and the flat horizon sit on top of the terrain so they're never hidden. */}
          {grid.includes(0) && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke={SKY.text} strokeOpacity={0.35} strokeDasharray="4 4" />}
          {grid.map((e) => (
            <text key={e} x={6} y={y(e) - 3} fontSize={10} fill={SKY.text} opacity={0.8} paintOrder="stroke" stroke="#000" strokeWidth={3} strokeOpacity={0.6}>{e === 0 ? 'flat horizon 0°' : `${e}°`}</text>
          ))}

          {/* Off-screen markers */}
          {bodies.map((b) => {
            const px = x(b.az)
            if (px >= -40 && px <= W + 40) return null
            const left = px < 0
            return (
              <text key={b.key + '-edge'} x={left ? 44 : W - 8} y={plotH / 2 + (b.key === 'earth' ? 16 : 0)} fontSize={11} fontWeight={600} textAnchor={left ? 'start' : 'end'} fill={b.color} paintOrder="stroke" stroke="#000" strokeWidth={3}>
                {left ? `← ${b.name} ${b.el.toFixed(0)}°` : `${b.name} ${b.el.toFixed(0)}° →`}
              </text>
            )
          })}

          {compassPoints.map((c) => {
            const px = x(c.az)
            if (px < 10 || px > W - 10) return null
            return (
              <g key={c.label}>
                <line x1={px} x2={px} y1={H - padB} y2={H - padB + 4} stroke={SKY.text} strokeOpacity={0.5} />
                <text x={px} y={H - 6} fontSize={c.label.length === 1 ? 11 : 10} fontWeight={c.label.length === 1 ? 600 : 400} textAnchor="middle" fill={SKY.text}>{c.label}</text>
              </g>
            )
          })}
        </svg>
        <div className="pointer-events-none absolute right-3 top-2.5 rounded-md bg-black/50 px-2 py-0.5 text-[11px] text-[#a2adc2]">{exLabel}</div>
      </div>

      <label className="mt-3 flex items-center gap-3 text-sm text-ink-2">
        <span className="sr-only">Mission time</span>
        <input type="range" className="w-full" min={a.startIdx} max={a.endIdx - 1} value={cursor} onChange={(e) => { setPlaying(false); onCursor(+e.target.value) }} aria-label="Mission time" />
      </label>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span className={sunUp ? 'text-sun-ink' : 'text-ink-3'}>{status(bodies[0])}</span>
        <span className={earthUp ? 'text-earth-ink' : 'text-ink-3'}>{status(bodies[1])}</span>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        The sky is black even at midday: the Moon has no atmosphere to scatter sunlight. Showing {fov}° of horizon; {exLabel.toLowerCase()} so ridges a few degrees high are visible. Sun and Earth discs are enlarged.
      </p>
    </div>
  )
}
