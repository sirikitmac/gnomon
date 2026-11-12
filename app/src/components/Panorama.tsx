import { useMemo } from 'react'
import type { Analysis, Site } from '../lib/types'

/** First-person 360° horizon view: terrain skyline, plus Sun and Earth tracks over the mission. */
export default function Panorama({ site, a, cursor }: { site: Site; a: Analysis; cursor: number }) {
  const W = 720, H = 200, padB = 18
  const s = site.series
  const { elMin, elMax } = useMemo(() => {
    let lo = Math.min(...site.skyline), hi = Math.max(...site.skyline)
    for (let i = a.startIdx; i < a.endIdx; i++) {
      lo = Math.min(lo, s.sunEl[i], s.earthEl[i])
      hi = Math.max(hi, s.sunEl[i], s.earthEl[i])
    }
    const span = Math.max(4, hi - lo)
    return { elMin: lo - span * 0.12, elMax: hi + span * 0.15 }
  }, [site, a, s])

  const x = (az: number) => (az / 360) * W
  const y = (el: number) => (H - padB) * (1 - (el - elMin) / (elMax - elMin))

  const terrain = useMemo(() => {
    const pts = site.skyline.map((v, i) => `${x(i)},${y(v)}`).join(' ')
    return `0,${H - padB} ${pts} ${W},${y(site.skyline[0])} ${W},${H - padB}`
  }, [site, elMin, elMax]) // eslint-disable-line react-hooks/exhaustive-deps

  const track = (az: number[], el: number[]) => {
    const step = Math.max(1, Math.floor((a.endIdx - a.startIdx) / 400))
    const out: { x: number; y: number }[] = []
    for (let i = a.startIdx; i < a.endIdx; i += step) out.push({ x: x(az[i]), y: y(el[i]) })
    return out
  }
  const sunT = track(s.sunAz, s.sunEl)
  const earthT = track(s.earthAz, s.earthEl)
  const flatY = y(0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0b1220" />
          <stop offset="1" stopColor="#111a2c" />
        </linearGradient>
        <linearGradient id="ground" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3a3f4b" />
          <stop offset="1" stopColor="#15181f" />
        </linearGradient>
      </defs>
      <rect width={W} height={H - padB} fill="url(#sky)" rx={6} />
      <line x1={0} x2={W} y1={flatY} y2={flatY} stroke="var(--color-ink-500)" strokeDasharray="3 4" strokeWidth={0.8} />
      <text x={6} y={flatY - 4} fontSize={9} fill="var(--color-ink-500)">flat horizon 0°</text>
      {sunT.map((p, i) => <circle key={'s' + i} cx={p.x} cy={p.y} r={1.3} fill="var(--color-sun)" opacity={0.55} />)}
      {earthT.map((p, i) => <circle key={'e' + i} cx={p.x} cy={p.y} r={1.3} fill="var(--color-earth)" opacity={0.55} />)}
      <polygon points={terrain} fill="url(#ground)" stroke="#9aa3b5" strokeWidth={0.8} />
      <circle cx={x(s.sunAz[cursor])} cy={y(s.sunEl[cursor])} r={6} fill="var(--color-sun)" stroke="#05070c" strokeWidth={1.5} />
      <circle cx={x(s.earthAz[cursor])} cy={y(s.earthEl[cursor])} r={5} fill="var(--color-earth)" stroke="#05070c" strokeWidth={1.5} />
      {['N', 'E', 'S', 'W', 'N'].map((d, i) => (
        <text key={i} x={Math.min(W - 8, Math.max(4, (i * W) / 4 - 4))} y={H - 4} fontSize={10} fill="var(--color-ink-500)">{d}</text>
      ))}
      <text x={W - 6} y={12} fontSize={9} textAnchor="end" fill="var(--color-ink-500)">{elMax.toFixed(1)}°</text>
    </svg>
  )
}
