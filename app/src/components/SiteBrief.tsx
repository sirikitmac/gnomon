import { fmtDate, fmtHours, hoursUntilChange, idxToDate } from '../lib/engine'
import { rangeWithin, useTerrainMeta } from '../lib/siteTerrain'
import type { Dataset, Site } from '../lib/types'

function Countdown({ label, setWord, riseWord, color, flags, ds, idx }: { label: string; setWord: string; riseWord: string; color: string; flags: number[]; ds: Dataset; idx: number }) {
  const c = hoursUntilChange(ds, flags, idx)
  const vis = !!flags[idx]
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, opacity: vis ? 1 : 0.25 }} />
        {label} {vis ? 'in view' : 'below skyline'}
      </div>
      <div className="text-sm tabular text-ink-2">
        {c ? `${vis ? setWord : riseWord} in ${fmtHours(c.hours)}` : vis ? `No ${setWord.toLowerCase()} in range` : 'Not in range'}
      </div>
    </div>
  )
}

// Level comes from the pipeline (finest DEM pixel size); the Terrain row names the actual source.
function confidenceLabel(site: Site): string {
  switch (site.confidence) {
    case 'high': return 'High: 5 m site terrain'
    case 'medium': return 'Medium: 20 m mosaic, no 5 m site terrain'
    case 'low': return site.terrain.startsWith('none') ? 'Low: no terrain model' : 'Low: coarse terrain only'
    case 'mock': return 'Mock: synthetic terrain'
    default: return site.confidence
  }
}

/** Spread of sun exposure close to the landing point, from the 100 m exposure grid (Site 3D data). */
function NearbySun({ site }: { site: Site }) {
  const { value: meta } = useTerrainMeta(site.id)
  const ex = meta?.available ? meta.exposure : undefined
  if (!ex) return null
  const [lo, hi] = rangeWithin(ex.sunPct, ex.n, ex.spacing_m, 500)
  return (
    <>
      <dt className="text-ink-3">Nearby</dt>
      <dd title="Share of Nov 2026 – Dec 2028 with the Sun's centre above each spot's own skyline, on a 100 m grid">
        Within 500 m of the landing point, sun ranges from {Math.round(lo)}% to {Math.round(hi)}%
      </dd>
    </>
  )
}

export default function SiteBrief({ ds, site, idx, flush = false }: { ds: Dataset; site: Site; idx: number; flush?: boolean }) {
  return (
    <section className={`flex flex-col p-5 ${flush ? 'min-h-full bg-transparent' : 'rounded-[14px] bg-surface shadow-card'}`}>
      <div className="text-xs text-ink-3">{site.role} site</div>
      <h2 className="mt-1 font-display text-2xl font-semibold leading-tight">{site.name}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{site.story}</p>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-ink-3">Location</dt>
        <dd className="tabular">{Math.abs(site.lat).toFixed(2)}°{site.lat < 0 ? 'S' : 'N'}, {Math.abs(site.lonEast).toFixed(2)}°{site.lonEast < 0 ? 'W' : 'E'}</dd>
        <dt className="text-ink-3">Confidence</dt>
        <dd>{confidenceLabel(site)}</dd>
        <NearbySun site={site} />
      </dl>

      <details className="group mt-4 rounded-[12px] bg-surface-2/60 px-3.5 py-2.5 text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-ink-2 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
          Data sources
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 group-open:rotate-180" aria-hidden><path d="M4 6l4 4 4-4" /></svg>
        </summary>
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px] leading-snug">
          <dt className="text-ink-3">Site</dt>
          <dd className="break-words">{site.source}</dd>
          {site.frame && (
            <>
              <dt className="text-ink-3">Frame</dt>
              <dd title={site.frameNote}>{site.frame === 'ME' ? 'Mean Earth (same as LOLA and Horizons)' : 'Not stated by the source'}</dd>
            </>
          )}
          <dt className="text-ink-3">Terrain</dt>
          <dd>{site.terrain}</dd>
        </dl>
      </details>

      <div className="mt-auto pt-5">
        <div className="flex items-baseline justify-between border-b border-line pb-2">
          <span className="text-xs text-ink-3">At the selected time</span>
          <span className="text-xs tabular text-ink-2">{fmtDate(idxToDate(ds, idx))}</span>
        </div>
        <div className="divide-y divide-line">
          <Countdown label="Sun" setWord="Sunset" riseWord="Sunrise" color="var(--sun)" flags={site.series.sunVis} ds={ds} idx={idx} />
          <Countdown label="Earth" setWord="Earthset" riseWord="Earthrise" color="var(--earth)" flags={site.series.earthVis} ds={ds} idx={idx} />
        </div>
      </div>
    </section>
  )
}
