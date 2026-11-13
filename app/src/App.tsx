import { MotionConfig } from 'framer-motion'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import ElevationChart from './components/ElevationChart'
import Menu from './components/Menu'
import MissionPanel from './components/MissionPanel'
import Panorama from './components/Panorama'
import SiteBrief from './components/SiteBrief'
import SitePicker from './components/SitePicker'
import SummaryStrip from './components/SummaryStrip'
import Timeline from './components/Timeline'
import CompareTable from './components/CompareTable'
import LaunchCalendar from './components/LaunchCalendar'
import LearnTour from './components/LearnTour'
import PlanPanel from './components/PlanPanel'
import Popover, { MenuItem } from './components/Popover'
import ScenarioBanner from './components/ScenarioBanner'
import SkyView from './components/SkyView'
import Toast from './components/Toast'
import { compareSites } from './lib/compare'
import { analyze, bestLanding, clampIdx, fmtHours, idxToDate, nowIdx, withSunMode } from './lib/engine'
import { copyText, scrollToId } from './lib/dom'
import { checkPreset, PRESETS, resolvePreset, type Preset } from './lib/presets'
import { buildCsv, buildReportHtml, downloadText, openReport } from './lib/report'
import { decodePlan, encodePlan } from './lib/urlState'
import { useTheme } from './lib/theme'
import type { Dataset, Mission, PlanState, SunMode } from './lib/types'

const MoonScene = lazy(() => import('./components/MoonScene'))

function Panel({ id, title, hint, children, className = '' }: { id?: string; title?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 rounded-[14px] bg-surface p-4 shadow-card ${className}`}>
      {title && (
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-display text-[15px] font-semibold">{title}</h2>
          {hint && <span className="text-xs text-ink-3">{hint}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

const idxDay = (ds: Dataset, i: number) => idxToDate(ds, i).toISOString().slice(0, 10)

export default function App() {
  const [rawDs, setDs] = useState<Dataset | null>(null)
  const [sunMode, setSunMode] = useState<SunMode>('centre')
  const ds = useMemo(() => (rawDs ? withSunMode(rawDs, sunMode) : null), [rawDs, sunMode])
  const [error, setError] = useState<string | null>(null)
  const [siteId, setSiteId] = useState('malapert')
  const [mission, setMission] = useState<Mission>({ startIdx: 0, durationH: 24 * 10, needComms: true, slipDays: 0 })
  const [cursor, setCursor] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [planOn, setPlanOn] = useState(false)
  const [scenario, setScenario] = useState<Preset | null>(null)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [urlReady, setUrlReady] = useState(false)
  const [learnOn, setLearnOn] = useState(false)
  const [theme, setTheme] = useTheme()
  const notify = (text: string) => setToast((t) => ({ id: (t?.id ?? 0) + 1, text }))
  const clearToast = useCallback(() => setToast(null), [])
  const closeLearn = useCallback(() => { setLearnOn(false); document.getElementById('learn-button')?.focus() }, [])

  useEffect(() => {
    fetch('/data/sites.json')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: Dataset) => {
        setDs(d)
        // A shared link wins; anything it doesn't set falls back to the defaults (landing: today, else the best date).
        const fromUrl = decodePlan(d, location.search)
        const id = fromUrl.siteId ?? 'malapert'
        setSiteId(id)
        if (fromUrl.sunMode) setSunMode(fromUrl.sunMode)
        const base: Mission = { startIdx: 0, durationH: fromUrl.durationH ?? 24 * 10, needComms: fromUrl.needComms ?? true, slipDays: fromUrl.slipDays ?? 0 }
        let start = fromUrl.startIdx ?? nowIdx(d)
        if (start === null) start = bestLanding(d, d.sites.find((x) => x.id === id) ?? d.sites[0], base).idx
        setMission({ ...base, startIdx: start })
        setCursor(start)
        setUrlReady(true)
      })
      .catch((e) => setError(String(e)))
  }, [])

  // Dev guard: the preset texts describe what the data shows; warn if the data ever disagrees.
  useEffect(() => {
    if (!import.meta.env.DEV || !rawDs) return
    for (const p of PRESETS) for (const msg of checkPreset(withSunMode(rawDs, p.sunMode), p)) console.warn('[presets]', msg)
  }, [rawDs])

  const applyPlan = (st: PlanState) => {
    setSiteId(st.siteId)
    setSunMode(st.sunMode)
    setMission({ startIdx: st.startIdx, durationH: st.durationH, needComms: st.needComms, slipDays: st.slipDays })
    setCursor(st.startIdx)
  }

  const site = useMemo(() => ds?.sites.find((s) => s.id === siteId) ?? ds?.sites[0], [ds, siteId])
  const a = useMemo(() => (ds && site ? analyze(ds, site, mission.startIdx, mission) : null), [ds, site, mission])
  const slipped = useMemo(
    () => (ds && site && mission.slipDays > 0 ? analyze(ds, site, mission.startIdx + (mission.slipDays * 24) / ds.meta.stepHours, mission) : null),
    [ds, site, mission]
  )

  // Keep the address bar in sync with the plan (replaceState, debounced: no history entries, no reloads).
  const shareQuery = ds && site ? encodePlan(ds, { siteId: site.id, ...mission, sunMode }) : null
  useEffect(() => {
    if (!urlReady || !shareQuery) return
    const t = setTimeout(() => {
      try { history.replaceState(history.state, '', `${location.pathname}?${shareQuery}${location.hash}`) } catch { /* rate-limited by the browser; the next change retries */ }
    }, 250)
    return () => clearTimeout(t)
  }, [urlReady, shareQuery])
  const shareLink = shareQuery ? `${location.origin}${location.pathname}?${shareQuery}` : location.href

  const reportInput = () => {
    if (!ds || !site || !a) return null
    return { ds, site, mission, sunMode, a, slipped, rows: compareSites(ds, mission), link: shareLink, generatedAt: new Date(), name: `rocky-${site.id}-${idxDay(ds, mission.startIdx)}` }
  }

  const isDark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)

  const appBar = (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/70 backdrop-blur-2xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-4 lg:px-6">
        <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-[0.96]">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 5h12M3 9h12M3 13h12" /></svg>
        </button>
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-display text-[17px] font-semibold tracking-tight">Rocky</span>
          <span className="hidden truncate text-[13px] text-ink-3 sm:inline">Lunar landing site navigator</span>
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <button
            id="learn-button"
            onClick={() => setLearnOn((v) => !v)}
            aria-pressed={learnOn}
            disabled={!ds}
            title="A guided tour of how lunar landing sites work"
            className={`flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-[0.96] disabled:opacity-40 sm:px-2.5 ${learnOn ? 'bg-surface-2 text-ink' : ''}`}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden><path d="M2.5 4.5c2.2-1 4.4-1 6.5.5 2.1-1.5 4.3-1.5 6.5-.5v9.5c-2.2-1-4.4-1-6.5.5-2.1-1.5-4.3-1.5-6.5-.5V4.5ZM9 5v9.5" /></svg>
            <span className="hidden md:inline">Learn</span>
            <span className="sr-only md:hidden">Learn</span>
          </button>
          <Popover
            label="Share"
            title="Share link, report and CSV"
            width={300}
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 11.5V2.5M5.5 6 9 2.5 12.5 6M4 9.5v5.5h10V9.5" /></svg>}
          >
            {(close) => (
              <>
                <MenuItem
                  title="Copy link"
                  detail="A link that reopens this exact plan"
                  disabled={!ds}
                  onSelect={async () => {
                    const ok = await copyText(shareLink)
                    close()
                    notify(ok ? 'Link copied' : "Couldn't copy. Copy it from the address bar instead.")
                  }}
                />
                <MenuItem
                  title="Download report"
                  detail="One page to print or save as PDF"
                  disabled={!ds}
                  onSelect={() => {
                    const r = reportInput()
                    if (!r) return
                    const how = openReport(buildReportHtml(r), r.name + '.html')
                    close()
                    notify(how === 'opened' ? 'Report opened in a new tab' : 'Report downloaded')
                  }}
                />
                <MenuItem
                  title="Download CSV"
                  detail="The all-sites table as a spreadsheet"
                  disabled={!ds}
                  onSelect={() => {
                    const r = reportInput()
                    if (!r) return
                    downloadText(r.name + '-all-sites.csv', buildCsv(r), 'text/csv')
                    close()
                    notify('CSV downloaded')
                  }}
                />
              </>
            )}
          </Popover>
          <Popover
            label="Scenarios"
            title="One-click demo scenarios"
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden><path d="M5 3.5v11l9-5.5-9-5.5Z" /></svg>}
          >
            {(close) => (
              <>
                <div className="px-3 pb-1 pt-1.5 text-xs text-ink-3">Scenarios set the site, dates and mission for you</div>
                {PRESETS.map((p) => {
                  const st = ds ? resolvePreset(ds, p) : null
                  return (
                    <MenuItem
                      key={p.id}
                      title={p.title}
                      detail={st ? p.blurb : 'Date not in the loaded data'}
                      disabled={!st}
                      onSelect={() => { if (!st) return; applyPlan(st); setScenario(p); close() }}
                    />
                  )
                })}
              </>
            )}
          </Popover>
          {ds?.meta.mock && (
            <button onClick={() => setMenuOpen(true)} className="rounded-full border border-risk/40 bg-risk/10 px-3 py-1 text-xs text-risk-ink" title={ds.meta.notes}>
              Mock data
            </button>
          )}
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-[0.96]"
          >
            {isDark ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="9" cy="9" r="3.4" /><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M15 10.6A6.5 6.5 0 0 1 7.4 3a6.5 6.5 0 1 0 7.6 7.6Z" /></svg>
            )}
          </button>
        </div>
      </div>
    </header>
  )

  let body: React.ReactNode
  if (error) {
    body = <p className="p-8 text-nogo-ink">Couldn't load app/public/data/sites.json ({error}). Run <code>python pipeline/generate_mock.py</code> and reload.</p>
  } else if (!ds || !site || !a) {
    body = <p className="grid h-[60vh] place-items-center text-ink-3">Loading mission data…</p>
  } else {
    const setLanding = (idx: number) => {
      const i = clampIdx(ds, idx)
      setMission((m) => ({ ...m, startIdx: i }))
      setCursor(i)
    }
    const cur = Math.max(a.startIdx, Math.min(a.endIdx - 1, cursor))
    body = (
      <div className="mx-auto grid max-w-[1500px] gap-5 p-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:p-6">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[4.5rem] lg:self-start">
          <Panel title="Landing site">
            <SitePicker sites={ds.sites} value={site.id} onChange={setSiteId} />
          </Panel>
          <Panel title="Mission">
            <MissionPanel
              ds={ds}
              mission={mission}
              onChange={(m) => { setMission(m); if (m.startIdx !== mission.startIdx) setCursor(m.startIdx) }}
              onBest={() => setLanding(bestLanding(ds, site, mission).idx)}
              onPlan={() => { setPlanOn(true); scrollToId('planner') }}
              nowIndex={nowIdx(ds)}
              onNow={(i) => setLanding(i)}
              sunMode={sunMode}
              onSunMode={setSunMode}
            />
          </Panel>
        </aside>

        <main className="flex min-w-0 flex-col gap-5">
          <ScenarioBanner scenario={scenario} onClose={() => setScenario(null)} />
          <div id="verdict" className="scroll-mt-20">
            <SummaryStrip ds={ds} a={a} slipped={slipped} slipDays={mission.slipDays} needComms={mission.needComms} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section id="moon-view" className="relative h-[380px] overflow-hidden rounded-[14px] bg-[#05070c] shadow-card lg:h-[440px]">
              <Suspense fallback={<div className="grid h-full place-items-center text-sm text-ink-3">Loading Moon…</div>}>
                <MoonScene site={site} sites={ds.sites} idx={cur} onSelect={setSiteId} />
              </Suspense>
              <div className="pointer-events-none absolute bottom-3 left-4 flex gap-4 text-xs text-[#a2adc2]">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3ddc97]" />Landing site</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#4e9fff]" />Earth direction</span>

              </div>
            </section>
            <SiteBrief ds={ds} site={site} idx={cur} />
          </div>

          <Panel id="all-sites" title="All sites" hint="Same landing date and mission length for every site. Click a row to open that site.">
            <CompareTable ds={ds} mission={mission} cursor={cur} selectedId={site.id} onSelect={setSiteId} />
          </Panel>

          <Panel id="planner" title="Plan it for me" hint="Best site and landing date for your mission settings">
            <PlanPanel
              ds={ds}
              mission={mission}
              siteId={site.id}
              todayIdx={nowIdx(ds)}
              active={planOn}
              onActivate={() => setPlanOn(true)}
              onUse={(id, idx) => { setSiteId(id); setLanding(idx) }}
            />
          </Panel>

          <Panel id="timeline" title="Timeline" hint="Drag to move the landing. Solid box: mission. Dashed box: delayed landing.">
            <Timeline ds={ds} site={site} mission={mission} cursor={cur} onLanding={setLanding} onCursor={setCursor} />
            <label className="mt-4 flex items-center gap-3 text-sm text-ink-2">
              <span className="shrink-0">Mission time</span>
              <input type="range" className="w-full" min={a.startIdx} max={a.endIdx - 1} value={cur} onChange={(e) => setCursor(+e.target.value)} />
              <span className="w-24 shrink-0 text-right tabular">T+{fmtHours((cur - a.startIdx) * ds.meta.stepHours)}</span>
            </label>
          </Panel>

          <Panel id="sky-view" title="Sky view" hint="Standing at the site: the skyline, with the Sun and Earth at the mission time">
            <SkyView ds={ds} site={site} a={a} cursor={cur} onCursor={setCursor} />
          </Panel>

          <Panel id="launch-calendar" title="Launch calendar" hint={`${site.name}: each day is a mission landing at 00:00 UTC with your current settings`}>
            <LaunchCalendar ds={ds} site={site} mission={mission} todayIdx={nowIdx(ds)} onPick={setLanding} />
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel id="horizon-view" title="Horizon view" hint="Terrain around the site, with the Sun and Earth paths">
              <Panorama site={site} a={a} cursor={cur} />
            </Panel>
            <Panel title="Elevation during the mission" hint="Above the shaded terrain means visible">
              <ElevationChart ds={ds} site={site} a={a} cursor={cur} />
            </Panel>
          </div>
        </main>
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      {appBar}
      {body}
      <Toast message={toast} onDone={clearToast} />
      <LearnTour open={learnOn && !!ds} onClose={closeLearn} />
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} theme={theme} setTheme={setTheme} ds={ds} />
    </MotionConfig>
  )
}
