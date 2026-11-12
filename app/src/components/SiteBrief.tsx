import { fmtDate, fmtHours, hoursUntilChange, idxToDate } from '../lib/engine'
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

export default function SiteBrief({ ds, site, idx }: { ds: Dataset; site: Site; idx: number }) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface p-5">
      <div className="text-xs text-ink-3">{site.role} site</div>
      <h2 className="mt-1 font-display text-2xl font-semibold leading-tight">{site.name}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{site.story}</p>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-ink-3">Location</dt>
        <dd className="tabular">{Math.abs(site.lat).toFixed(2)}°{site.lat < 0 ? 'S' : 'N'}, {Math.abs(site.lonEast).toFixed(2)}°{site.lonEast < 0 ? 'W' : 'E'}</dd>
        <dt className="text-ink-3">Source</dt>
        <dd>{site.source}</dd>
        <dt className="text-ink-3">Terrain</dt>
        <dd>{site.terrain}</dd>
        <dt className="text-ink-3">Confidence</dt>
        <dd>{confidenceLabel(site)}</dd>
      </dl>

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
