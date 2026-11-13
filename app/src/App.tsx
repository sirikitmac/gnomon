import { MotionConfig } from 'framer-motion'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import ElevationChart from './components/ElevationChart'
import Menu from './components/Menu'
import MissionPanel from './components/MissionPanel'
import Panorama from './components/Panorama'
import SiteBrief from './components/SiteBrief'
import SitePicker from './components/SitePicker'
import SummaryStrip from './components/SummaryStrip'
import Timeline, { TimelineAxis } from './components/Timeline'
import CompareTable from './components/CompareTable'
import { analyze, bestLanding, clampIdx, fmtHours, nowIdx, withSunMode } from './lib/engine'
import { useTheme } from './lib/theme'
import type { Dataset, Mission, SunMode } from './lib/types'

const MoonScene = lazy(() => import('./components/MoonScene'))

function Panel({ title, hint, children, className = '' }: { title?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>
      {title && (
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-display text-base font-semibold">{title}</h2>
          {hint && <span className="text-xs text-ink-3">{hint}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

export default function App() {
  const [rawDs, setDs] = useState<Dataset | null>(null)
  const [sunMode, setSunMode] = useState<SunMode>('centre')
  const ds = useMemo(() => (rawDs ? withSunMode(rawDs, sunMode) : null), [rawDs, sunMode])
  const [error, setError] = useState<string | null>(null)
  const [siteId, setSiteId] = useState('malapert')
  const [mission, setMission] = useState<Mission>({ startIdx: 0, durationH: 24 * 10, needComms: true, slipDays: 0 })
  const [cursor, setCursor] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useTheme()

  useEffect(() => {
    fetch('/data/sites.json')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: Dataset) => {
        setDs(d)
        const today = nowIdx(d)
        if (today !== null) {
          setMission((m) => ({ ...m, startIdx: today }))
          setCursor(today)
          return
        }
        const first = d.sites.find((x) => x.id === 'malapert') ?? d.sites[0]
        const best = bestLanding(d, first, { startIdx: 0, durationH: 24 * 10, needComms: true, slipDays: 0 })
        setMission((m) => ({ ...m, startIdx: best.idx }))
        setCursor(best.idx)
      })
      .catch((e) => setError(String(e)))
  }, [])

  const site = useMemo(() => ds?.sites.find((s) => s.id === siteId) ?? ds?.sites[0], [ds, siteId])
  const a = useMemo(() => (ds && site ? analyze(ds, site, mission.startIdx, mission) : null), [ds, site, mission])
  const slipped = useMemo(
    () => (ds && site && mission.slipDays > 0 ? analyze(ds, site, mission.startIdx + (mission.slipDays * 24) / ds.meta.stepHours, mission) : null),
    [ds, site, mission]
  )

  const isDark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)

  const appBar = (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-4 lg:px-6">
        <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 active:scale-[0.97]">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 5h12M3 9h12M3 13h12" /></svg>
        </button>
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-display text-lg font-semibold">Rocky</span>
          <span className="hidden truncate text-sm text-ink-3 sm:inline">Lunar landing site navigator</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {ds?.meta.mock && (
            <button onClick={() => setMenuOpen(true)} className="rounded-full border border-risk/40 bg-risk/10 px-3 py-1 text-xs text-risk" title={ds.meta.notes}>
              Mock data
            </button>
          )}
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 active:scale-[0.97]"
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
    body = <p className="p-8 text-nogo">Couldn't load app/public/data/sites.json ({error}). Run <code>python pipeline/generate_mock.py</code> and reload.</p>
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
      <div className="mx-auto grid max-w-[1500px] gap-4 p-4 lg:grid-cols-[288px_minmax(0,1fr)] lg:p-6">
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
              nowIndex={nowIdx(ds)}
              onNow={(i) => setLanding(i)}
              sunMode={sunMode}
              onSunMode={setSunMode}
            />
          </Panel>
        </aside>

        <main className="flex min-w-0 flex-col gap-4">
          <SummaryStrip ds={ds} a={a} slipped={slipped} slipDays={mission.slipDays} needComms={mission.needComms} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="relative h-[380px] overflow-hidden rounded-2xl border border-line bg-[#060a12] lg:h-[440px]">
              <Suspense fallback={<div className="grid h-full place-items-center text-sm text-ink-3">Loading Moon…</div>}>
                <MoonScene site={site} idx={cur} />
              </Suspense>
              <div className="pointer-events-none absolute bottom-3 left-4 flex gap-4 text-xs text-[#a2adc2]">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3ddc97]" />Landing site</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#4e9fff]" />Earth direction</span>
                <span>Lighting follows the selected time</span>
              </div>
            </section>
            <SiteBrief ds={ds} site={site} idx={cur} />
          </div>

          <Panel title="All sites" hint="Same landing date and mission length for every site. Click a row to open that site.">
            <CompareTable ds={ds} mission={mission} cursor={cur} selectedId={site.id} onSelect={setSiteId} />
          </Panel>

          <Panel title="Timeline" hint="Drag to move the landing. Solid box: mission. Dashed box: delayed landing.">
            <Timeline ds={ds} site={site} mission={mission} cursor={cur} onLanding={setLanding} onCursor={setCursor} />
            <TimelineAxis ds={ds} />
            <label className="mt-4 flex items-center gap-3 text-sm text-ink-2">
              <span className="shrink-0">Mission time</span>
              <input type="range" className="w-full" min={a.startIdx} max={a.endIdx - 1} value={cur} onChange={(e) => setCursor(+e.target.value)} />
              <span className="w-24 shrink-0 text-right tabular">T+{fmtHours((cur - a.startIdx) * ds.meta.stepHours)}</span>
            </label>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Horizon view" hint="Terrain around the site, with the Sun and Earth paths">
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
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} theme={theme} setTheme={setTheme} ds={ds} />
    </MotionConfig>
  )
}
