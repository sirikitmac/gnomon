import { useEffect, useMemo, useState } from 'react'
import { analyzeArea, loadArea, type AreaData } from '../lib/area'
import type { Dataset, Mission, Rules, Site, Verdict } from '../lib/types'

const RADII = [250, 500, 1000, 1500]
const FILL: Record<Verdict, string> = { GO: 'var(--color-both)', RISKY: 'var(--color-risk)', 'NO-GO': 'var(--color-nogo)' }
const vText: Record<Verdict, string> = { GO: 'text-both-ink', RISKY: 'text-risk-ink', 'NO-GO': 'text-nogo-ink' }

/**
 * The verdict across the ground a lander could actually touch down on, not just one point:
 * share of the area that is GO / RISKY / NO-GO, the worst case, and the spread of sunlight.
 */
export default function LandingArea({ ds, site, mission, rules }: { ds: Dataset; site: Site; mission: Mission; rules: Rules }) {
  const [radius, setRadius] = useState(500)
  const [state, setState] = useState<{ id: string; area: AreaData | null; done: boolean }>({ id: '', area: null, done: false })
  useEffect(() => {
    let live = true
    setState({ id: site.id, area: null, done: false })
    loadArea(site.id).then((area) => { if (live) setState({ id: site.id, area, done: true }) })
    return () => { live = false }
  }, [site.id])

  const area = state.id === site.id ? state.area : null
  const res = useMemo(() => (area ? analyzeArea(ds, site, area, mission, rules, radius) : null), [ds, site, area, mission, rules, radius])

  return (
    <section aria-labelledby="area-title" className="border-t border-line px-5 py-4">
      <h2 id="area-title" className="font-display text-[15px] font-semibold">Landing area</h2>
      {!state.done || state.id !== site.id ? (
        <p className="mt-2 text-[12px] text-ink-3">Loading terrain…</p>
      ) : !area || !res ? (
        <p className="mt-2 text-[12px] leading-snug text-ink-2">
          No detailed terrain grid for this site yet, so the verdict covers the landing point only. Grids exist for Malapert, Haworth, Mons Mouton and Near Shackleton.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[12px] leading-snug text-ink-2">
            The same verdict at every 100 m point within {radius >= 1000 ? `${radius / 1000} km` : `${radius} m`} of the landing point, because a lander can come down anywhere in that circle.
          </p>
          <div className="mt-3 grid grid-cols-4 gap-0.5 rounded-full bg-surface-2 p-[2px] text-xs" role="radiogroup" aria-label="Landing area radius">
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={radius === r}
                onClick={() => setRadius(r)}
                className={`rounded-full px-1 py-1.5 tabular transition-[background-color,color,box-shadow] duration-150 ${radius === r ? 'bg-surface font-medium text-ink shadow-control' : 'text-ink-2 hover:text-ink'}`}
              >
                {r >= 1000 ? `${r / 1000} km` : `${r} m`}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-start gap-3">
            <AreaMap points={res.points} radius={radius} />
            <dl className="min-w-0 flex-1 text-[12px] leading-snug">
              <dt className="text-ink-3">Worst case in the area</dt>
              <dd className={`font-display text-[17px] font-semibold ${vText[res.worst]}`}>{res.worst}</dd>
              <dt className="mt-2 text-ink-3">Share of the area</dt>
              <dd className="tabular">
                {(['GO', 'RISKY', 'NO-GO'] as Verdict[]).filter((v) => res.share[v] >= 0.5).map((v) => (
                  <span key={v} className="mr-2 inline-flex items-center gap-1 whitespace-nowrap">
                    <span className="h-2 w-2 rounded-full" style={{ background: FILL[v] }} aria-hidden />
                    {Math.round(res.share[v])}% {v}
                  </span>
                ))}
              </dd>
              <dt className="mt-2 text-ink-3">Sunlight across the area</dt>
              <dd className="tabular">
                {Math.round(res.sunMid[0])}–{Math.round(res.sunMid[1])}%
                <span className="text-ink-3"> (most of it), {Math.round(res.sunRange[0])}–{Math.round(res.sunRange[1])}% extremes</span>
              </dd>
            </dl>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-ink-3">
            Skylines for the surrounding points come from 20 m LOLA terrain plus distant ridges; they agree with the pipeline&rsquo;s 5 m results to about 2 points on average. The landing point uses the full-detail skyline.
          </p>
        </>
      )}
    </section>
  )
}

function AreaMap({ points, radius }: { points: { east: number; north: number; verdict: Verdict }[]; radius: number }) {
  const S = 112
  const scale = (S / 2 - 4) / radius
  const cell = Math.max(2, 100 * scale - 1)
  return (
    <svg width={S} height={S + 12} viewBox={`${-S / 2} ${-S / 2 - 12} ${S} ${S + 12}`} className="shrink-0" role="img" aria-label="Map of the landing area coloured by verdict, north up">
      <circle r={S / 2 - 2} fill="var(--surface-2, transparent)" stroke="var(--line)" strokeWidth={1} />
      {points.map((p) => (
        <rect key={`${p.east},${p.north}`} x={p.east * scale - cell / 2} y={-p.north * scale - cell / 2} width={cell} height={cell} rx={cell > 6 ? 1.5 : 0.5} fill={FILL[p.verdict]} opacity={0.9} />
      ))}
      <circle r={3.2} fill="none" stroke="var(--color-ink, currentColor)" strokeWidth={1.4} />
      <text x={0} y={-S / 2 - 3} textAnchor="middle" fontSize={9} fontWeight={600} fill="currentColor" opacity={0.55}>N</text>
    </svg>
  )
}
