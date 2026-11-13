import type { CompareRow } from './compare'
import { fmtDateYear, fmtHours, idxToDate } from './engine'
import type { Analysis, Dataset, Mission, Site, SunMode, Verdict } from './types'

export interface ReportInput {
  ds: Dataset
  site: Site
  mission: Mission
  sunMode: SunMode
  a: Analysis
  slipped: Analysis | null
  rows: CompareRow[]
  link: string
  generatedAt: Date
  /** Optional mission name, shown as the report's title. */
  missionName?: string | null
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const pct = (v: number) => `${Math.round(v)}%`
const sunRule = (m: SunMode) => (m === 'firstLight' ? 'Top edge of the Sun clears the skyline' : 'Centre of the Sun clears the skyline')
const stamp = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'

// ---------- CSV ----------

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The all-sites comparison as CSV (one row per site, numbers unrounded to 0.1). */
export function buildCsv({ ds, mission, sunMode, rows }: Pick<ReportInput, 'ds' | 'mission' | 'sunMode' | 'rows'>): string {
  const landing = idxToDate(ds, mission.startIdx).toISOString()
  const head = [
    'site_id', 'site', 'role', 'lat_deg', 'lon_east_deg', 'terrain_confidence',
    'landing_utc', 'mission_days', 'needs_comms', 'sun_rule',
    'verdict', 'coverage_pct', 'sunlight_pct', 'earth_in_view_pct', 'both_pct', 'longest_blackout_h',
    'slip_days', 'slipped_verdict', 'slipped_coverage_pct', 'slipped_longest_blackout_h',
  ]
  const r1 = (v: number) => Math.round(v * 10) / 10
  const lines = rows.map(({ site, a, slipped }) => [
    site.id, site.name, site.role, site.lat, site.lonEast, site.confidence,
    landing, Math.round(mission.durationH / 24), mission.needComms ? 'yes' : 'no', sunMode === 'firstLight' ? 'top edge' : 'centre',
    a.verdict, r1(a.coveragePct), r1(a.sunPct), r1(a.earthPct), r1(a.bothPct), a.longestBlackoutH,
    mission.slipDays, slipped?.verdict ?? '', slipped ? r1(slipped.coveragePct) : '', slipped?.longestBlackoutH ?? '',
  ].map(csvCell).join(','))
  return [head.join(','), ...lines].join('\n') + '\n'
}

// ---------- HTML report ----------

const VCOLOR: Record<Verdict, string> = { GO: '#1a7f37', RISKY: '#a35200', 'NO-GO': '#c4001a' }
const pill = (v: Verdict) => `<span class="pill" style="color:${VCOLOR[v]};border-color:${VCOLOR[v]}">${v}</span>`

/** A self-contained, print-friendly one-page report (open it and print / save as PDF). */
export function buildReportHtml(r: ReportInput): string {
  const { ds, site, mission, a, slipped } = r
  const d = (i: number) => esc(fmtDateYear(idxToDate(ds, i)))
  const days = Math.round(mission.durationH / 24)
  const w = a.firstWindow
  const windowText = w
    ? `${d(w.from)} to ${d(w.to)} (${fmtHours((w.to - w.from) * ds.meta.stepHours)} without a break${w.from > a.startIdx ? `, opens ${fmtHours((w.from - a.startIdx) * ds.meta.stepHours)} after landing` : ''})`
    : 'No window in the data range'
  const slipIdx = mission.startIdx + (mission.slipDays * 24) / ds.meta.stepHours

  const rowsHtml = r.rows.map(({ site: s, a: x, slipped: y }) => `
    <tr${s.id === site.id ? ' class="sel"' : ''}>
      <td><b>${esc(s.name)}</b><div class="muted">${esc(s.role)} · terrain ${esc(s.confidence)}</div></td>
      <td>${pill(x.verdict)}</td>
      <td class="num">${pct(x.coveragePct)}</td>
      <td class="num">${pct(x.sunPct)}</td>
      <td class="num">${pct(x.earthPct)}</td>
      <td class="num">${pct(x.bothPct)}</td>
      <td class="num">${esc(fmtHours(x.longestBlackoutH))}</td>
      ${y ? `<td>${pill(y.verdict)} <span class="muted">${pct(y.coveragePct)}</span></td>` : ''}
    </tr>`).join('')

  const slipHtml = slipped ? `
  <section>
    <h2>Slip Test: landing ${mission.slipDays} day${mission.slipDays > 1 ? 's' : ''} late</h2>
    <p>Landing ${d(slipIdx)} instead: ${pill(slipped.verdict)} ${slipped.verdict === a.verdict ? '(same verdict)' : `(was ${a.verdict})`}.
    Coverage ${pct(a.coveragePct)} → ${pct(slipped.coveragePct)}, longest blackout ${esc(fmtHours(a.longestBlackoutH))} → ${esc(fmtHours(slipped.longestBlackoutH))}.</p>
  </section>` : ''

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${r.missionName ? esc(r.missionName) + ': ' : ''}Rocky mission report, ${esc(site.name)}, ${d(mission.startIdx)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f5f5f7; color: #1d1d1f; font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif; }
  .page { max-width: 820px; margin: 24px auto; background: #fff; padding: 32px 36px; border-radius: 12px; box-shadow: 0 0 0 .5px rgba(0,0,0,.08), 0 8px 30px -10px rgba(0,0,0,.15); }
  .bar { max-width: 820px; margin: 16px auto 0; display: flex; gap: 8px; justify-content: flex-end; padding: 0 16px; }
  .bar button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; background: #007aff; color: #fff; cursor: pointer; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -.01em; }
  h2 { font-size: 13px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .04em; color: #6e6e73; }
  section { margin-top: 18px; }
  .muted { color: #6e6e73; font-size: 11.5px; }
  .head { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; border-bottom: 1px solid #e5e5ea; padding-bottom: 12px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 16px; margin: 0; }
  dt { color: #6e6e73; }
  dd { margin: 0; }
  .verdict { display: flex; gap: 16px; align-items: center; }
  .big { font-size: 22px; font-weight: 700; padding: 6px 14px; border-radius: 10px; color: #fff; }
  .metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 10px; }
  .metrics div { background: #f5f5f7; border-radius: 8px; padding: 8px 10px; }
  .metrics b { display: block; font-size: 17px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 500; color: #6e6e73; font-size: 11.5px; border-bottom: 1px solid #e5e5ea; padding: 4px 6px; }
  td { border-bottom: 1px solid #f0f0f2; padding: 5px 6px; vertical-align: top; }
  tr.sel td { background: #eef5ff; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .pill { display: inline-block; border: 1px solid; border-radius: 6px; padding: 0 6px; font-size: 11px; font-weight: 700; }
  .note { font-size: 11.5px; color: #48484a; }
  a { color: #0062cc; word-break: break-all; }
  @media (max-width: 600px) { .page { padding: 20px; margin: 12px; } .metrics { grid-template-columns: repeat(2, 1fr); } .tbl { overflow-x: auto; } }
  @page { size: A4; margin: 12mm; }
  @media print {
    body { background: #fff; font-size: 11px; }
    .bar { display: none; }
    .page { box-shadow: none; margin: 0; padding: 0; max-width: none; }
    section { break-inside: avoid; margin-top: 12px; }
    tr.sel td { background: #eef5ff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .big { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head>
<body>
<div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
<main class="page">
  <div class="head">
    <div><h1>${r.missionName ? esc(r.missionName) : 'Rocky mission report'}</h1><div class="muted">${r.missionName ? 'Rocky mission report · ' : ''}Lunar Landing Site Navigator · NASA Space Apps 2026</div></div>
    <div class="muted">Generated ${esc(stamp(r.generatedAt))}</div>
  </div>

  <section>
    <h2>Mission settings</h2>
    <dl>
      <dt>Site</dt><dd>${esc(site.name)} (${Math.abs(site.lat).toFixed(2)}°${site.lat < 0 ? 'S' : 'N'}, ${Math.abs(site.lonEast).toFixed(2)}°${site.lonEast < 0 ? 'W' : 'E'})</dd>
      <dt>Landing</dt><dd>${d(mission.startIdx)}</dd>
      <dt>Mission length</dt><dd>${days} day${days > 1 ? 's' : ''}</dd>
      <dt>Needs</dt><dd>${mission.needComms ? 'Sunlight and direct-to-Earth comms at the same time' : 'Sunlight only'}</dd>
      <dt>Sun counts as up when</dt><dd>${sunRule(r.sunMode)}</dd>
      <dt>Slip Test</dt><dd>${mission.slipDays > 0 ? `+${mission.slipDays} day${mission.slipDays > 1 ? 's' : ''}` : 'Off'}</dd>
    </dl>
  </section>

  <section>
    <h2>Verdict for ${esc(site.name)}</h2>
    <div class="verdict">
      <span class="big" style="background:${VCOLOR[a.verdict]}">${a.verdict}</span>
      <div><div class="muted">${mission.needComms ? 'Power and comms' : 'Power'} window after landing</div><div>${windowText}</div></div>
    </div>
    <div class="metrics">
      <div><span class="muted">Coverage</span><b>${pct(a.coveragePct)}</b></div>
      <div><span class="muted">Sunlight</span><b>${pct(a.sunPct)}</b></div>
      <div><span class="muted">Earth in view</span><b>${pct(a.earthPct)}</b></div>
      <div><span class="muted">Both at once</span><b>${pct(a.bothPct)}</b></div>
      <div><span class="muted">Longest blackout</span><b>${esc(fmtHours(a.longestBlackoutH))}</b></div>
    </div>
  </section>
  ${slipHtml}
  <section>
    <h2>All sites, same mission</h2>
    <div class="tbl"><table>
      <thead><tr><th>Site</th><th>Verdict</th><th class="num">Coverage</th><th class="num">Sunlight</th><th class="num">Earth</th><th class="num">Both</th><th class="num">Longest blackout</th>${mission.slipDays > 0 ? `<th>If ${mission.slipDays} d late</th>` : ''}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>
  </section>

  <section class="note">
    <h2>Method and data</h2>
    <p>Sun and Earth positions for each site come from NASA JPL Horizons (every ${ds.meta.stepHours} h, ${esc(fmtDateYear(idxToDate(ds, 0)))} to ${esc(fmtDateYear(idxToDate(ds, ds.meta.count - 1)))}).
    Each site's 360° skyline comes from NASA LRO LOLA terrain (PGDA 5 m site maps where available, plus wider LOLA mosaics), including the Moon's curvature.
    The Sun gives power and Earth gives direct contact only while above that skyline.
    <b>Coverage</b> is the share of mission hours with the requirement met; the <b>longest blackout</b> is the longest stretch without it.
    <b>GO</b> = coverage ≥ 75% and blackout ≤ 24 h; <b>RISKY</b> = ≥ 45% and ≤ 96 h; otherwise <b>NO-GO</b>.
    These thresholds are Team Rocky's own planning rules, not NASA criteria. Terrain confidence reflects the finest terrain map available for each site.</p>
    <p>Data: JPL Horizons (ssd.jpl.nasa.gov/horizons), PGDA LOLA topography (pgda.gsfc.nasa.gov/products/78), method after Mazarico et al. 2011.
    Chang'e-7 and Chandrayaan-3 coordinates come from CNSA and ISRO. Not affiliated with or endorsed by NASA.</p>
    <p>Open this plan in Rocky: <a href="${esc(r.link)}">${esc(r.link)}</a></p>
  </section>
</main>
</body></html>`
}

/** Trigger a browser download of text content. */
export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Open the report in a new tab; if pop-ups are blocked, download it as an .html file instead. */
export function openReport(html: string, filename: string): 'opened' | 'downloaded' {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const w = window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  if (w) return 'opened'
  downloadText(filename, html, 'text/html')
  return 'downloaded'
}
