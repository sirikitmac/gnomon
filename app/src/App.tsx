import { MotionConfig, motion } from 'framer-motion'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import ElevationChart from './components/ElevationChart'
import MissionPanel from './components/MissionPanel'
import Panorama from './components/Panorama'
import SitePicker from './components/SitePicker'
import Timeline, { TimelineAxis } from './components/Timeline'
import VerdictCard from './components/VerdictCard'
import { analyze, bestLanding, clampIdx, fmtDate, fmtHours, hoursUntilChange, idxToDate } from './lib/engine'
import type { Dataset, Mission } from './lib/types'

const MoonScene = lazy(() => import('./components/MoonScene'))

function Card({ title, hint, children, className = '' }: { title?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-space-700 bg-space-900/80 p-4 ${className}`}>
      {title && (
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-medium uppercase tracking-widest text-ink-500">{title}</h2>
          {hint && <span className="text-[11px] text-ink-500">{hint}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

function Countdown({ label, color, flags, ds, idx }: { label: string; color: string; flags: number[]; ds: Dataset; idx: number }) {
  const c = hoursUntilChange(ds, flags, idx)
  const vis = !!flags[idx]
  return (
    <div className="rounded-xl border border-space-700 bg-space-950/70 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
        <span className="h-2 w-2 rounded-full" style={{ background: color, opacity: vis ? 1 : 0.3 }} />
        {label} {vis ? 'visible' : 'hidden'}
      </div>
      <div className="mt-0.5 text-sm tabular">
        {c ? `${vis ? (label === 'Sun' ? 'Sets' : 'Earthset') : (label === 'Sun' ? 'Rises' : 'Earthrise')} in ${fmtHours(c.hours)}` : vis ? 'No set in range' : 'Not in range'}
      </div>
    </div>
  )
}

export default function App() {
  const [ds, setDs] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [siteId, setSiteId] = useState('malapert')
  const [mission, setMission] = useState<Mission>({ startIdx: 24 * 5, durationH: 24 * 10, needComms: true, slipDays: 0 })
  const [cursor, setCursor] = useState(24 * 5)

  useEffect(() => {
    fetch('/data/sites.json')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: Dataset) => {
        setDs(d)
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

  if (error) return <div className="p-8 text-nogo">Could not load data/sites.json: {error}</div>
  if (!ds || !site || !a) return <div className="grid h-full place-items-center text-ink-500">Loading mission data…</div>

  const setLanding = (idx: number) => {
    const i = clampIdx(ds, idx)
    setMission((m) => ({ ...m, startIdx: i }))
    setCursor(i)
  }
  const cur = Math.max(a.startIdx, Math.min(a.endIdx - 1, cursor))

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex min-h-full max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-ink-100 to-ink-500 shadow-[inset_-6px_-4px_10px_rgba(0,0,0,0.45)]" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Rocky</h1>
              <p className="text-xs text-ink-500">Lunar Landing Site Navigator · power and direct-to-Earth comms at a glance</p>
            </div>
          </div>
          {ds.meta.mock && (
            <span className="rounded-full border border-risk/40 bg-risk/10 px-3 py-1 text-xs text-risk" title={ds.meta.notes}>
              Mock data: simplified geometry, synthetic terrain
            </span>
          )}
        </header>

        <div className="grid flex-1 gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="flex flex-col gap-4">
            <Card title="Landing sites">
              <SitePicker sites={ds.sites} value={site.id} onChange={setSiteId} />
            </Card>
            <Card title="Mission setup">
              <MissionPanel
                ds={ds}
                mission={mission}
                onChange={(m) => { setMission(m); if (m.startIdx !== mission.startIdx) setCursor(m.startIdx) }}
                onBest={() => setLanding(bestLanding(ds, site, mission).idx)}
              />
            </Card>
          </aside>

          <main className="flex min-w-0 flex-col gap-4">
            <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
              <section className="relative h-[420px] overflow-hidden rounded-2xl border border-space-700 bg-space-950 lg:h-[460px]">
                <Suspense fallback={<div className="grid h-full place-items-center text-sm text-ink-500">Loading Moon…</div>}>
                  <MoonScene site={site} idx={cur} />
                </Suspense>
                <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">
                  <Countdown label="Sun" color="var(--color-sun)" flags={site.series.sunVis} ds={ds} idx={cur} />
                  <Countdown label="Earth" color="var(--color-earth)" flags={site.series.earthVis} ds={ds} idx={cur} />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-space-950 via-space-950/80 to-transparent" />
                <motion.div
                  key={site.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  className="pointer-events-none absolute bottom-4 left-4 right-4 max-w-md"
                >
                  <div className="text-xl font-semibold tracking-tight">{site.name}</div>
                  <p className="mt-1 text-sm text-ink-300">{site.story}</p>
                  <p className="mt-1 text-[11px] text-ink-500">Source: {site.source} · Terrain: {site.terrain}</p>
                </motion.div>
                <div className="pointer-events-none absolute right-4 top-4 rounded-lg bg-space-950/70 px-2.5 py-1.5 text-xs tabular text-ink-300 backdrop-blur">
                  {fmtDate(idxToDate(ds, cur))}
                </div>
              </section>
              <Card>
                <VerdictCard ds={ds} a={a} slipped={slipped} slipDays={mission.slipDays} needComms={mission.needComms} />
              </Card>
            </div>

            <Card title="Timeline" hint="Drag to move the landing · white box = mission · dashed = slipped">
              <Timeline ds={ds} site={site} mission={mission} cursor={cur} onLanding={setLanding} onCursor={setCursor} />
              <TimelineAxis ds={ds} />
              <label className="mt-3 flex items-center gap-3 text-xs text-ink-500">
                <span className="shrink-0">Scrub mission time</span>
                <input type="range" className="w-full" min={a.startIdx} max={a.endIdx - 1} value={cur} onChange={(e) => setCursor(+e.target.value)} />
                <span className="shrink-0 tabular text-ink-300">T+{fmtHours((cur - a.startIdx) * ds.meta.stepHours)}</span>
              </label>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Horizon view" hint="Why: terrain vs. Sun and Earth paths during the mission">
                <Panorama site={site} a={a} cursor={cur} />
              </Card>
              <Card title="Elevation over mission" hint="Above the grey terrain = visible">
                <ElevationChart ds={ds} site={site} a={a} cursor={cur} />
              </Card>
            </div>
          </main>
        </div>
      </div>
    </MotionConfig>
  )
}
