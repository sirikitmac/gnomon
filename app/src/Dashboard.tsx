import { MotionConfig } from 'framer-motion'
import GnomonMark from './components/GnomonMark'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ElevationChart from './components/ElevationChart'
import Menu from './components/Menu'
import MissionPanel from './components/MissionPanel'
import Panorama from './components/Panorama'
import SiteBrief from './components/SiteBrief'
import SitePicker from './components/SitePicker'
import SummaryStrip from './components/SummaryStrip'
import Timeline from './components/Timeline'
import CompareSites from './components/CompareSites'
import CompareTable from './components/CompareTable'
import LaunchCalendar from './components/LaunchCalendar'
import LearnTour from './components/LearnTour'
import PlanPanel from './components/PlanPanel'
import Popover, { MenuItem } from './components/Popover'
import ScenarioBanner from './components/ScenarioBanner'
import SkyView from './components/SkyView'
import Toast from './components/Toast'
import ViewTabs from './components/ViewTabs'
import { TARGET_VIEW, viewFromHash, type View } from './lib/views'
import { compareSites, loadCompareIds, saveCompareIds } from './lib/compare'
import { analyze, bestLanding, clampIdx, DEFAULT_RULES, EXAMPLE_LANDER, fmtDate, fmtHours, idxToDate, nowIdx, withRules, type Lander } from './lib/engine'
import PowerCheck from './components/PowerCheck'
import AskFive from './landing/AskFive'
import Five from './landing/Five'
import LandingArea from './components/LandingArea'
import { copyText } from './lib/dom'
import { checkPreset, PRESETS, resolvePreset, type Preset } from './lib/presets'
import { buildCsv, buildReportHtml, downloadText, openReport } from './lib/report'
import { decodePlan, encodePlan } from './lib/urlState'
import { useTheme } from './lib/theme'
import type { Dataset, Mission, PlanState, SunMode } from './lib/types'

const MoonScene = lazy(() => import('./components/MoonScene'))
const SiteScene = lazy(() => import('./components/SiteScene'))
const OrbitScene = lazy(() => import('./components/OrbitScene'))

type MoonMode = 'globe' | 'site3d' | 'orbit'
const MOON_MODE_KEY = 'rocky.moonMode'
function readMoonMode(): MoonMode {
  try { const v = sessionStorage.getItem(MOON_MODE_KEY); return v === 'site3d' || v === 'orbit' ? v : 'globe' } catch { return 'globe' }
}

/** "Globe | Site 3D" switch for the Moon panel, styled like the panel's other dark controls. */
function MoonModeSwitch({ value, onChange }: { value: MoonMode; onChange: (m: MoonMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Moon view" className="pointer-events-auto absolute left-8 top-3 z-20 flex rounded-full bg-[#0e1118]/75 p-0.5 ring-1 ring-white/15 backdrop-blur">
      {([['globe', 'Globe', 'The whole Moon with every site'], ['site3d', 'Site 3D', 'Real terrain around the selected site, lit at the mission time'], ['orbit', 'Orbit', 'Earth, Moon and Sun from outside, as a timelapse: why the light at the site changes']] as const).map(([m, label, title]) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          title={title}
          onClick={() => onChange(m)}
          className={`min-h-7 rounded-full px-3 text-xs font-medium transition-colors duration-150 ${value === m ? 'bg-[#fbf8f1] text-[#221f1c]' : 'text-[#d9d3c7] hover:text-white'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function SidebarSection({ title, hint, defaultOpen = true, children }: { title: string; hint?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-line last:border-b-0">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-semibold">{title}</h2>
          {hint && <p className="text-xs text-ink-3">{hint}</p>}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`} aria-hidden>
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </header>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  )
}

function Panel({ id, title, hint, action, children, className = '' }: { id?: string; title?: string; hint?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(true)
  return (
    <section id={id} className={`scroll-mt-20 border-b border-line bg-surface/92 backdrop-blur-2xl last:border-b-0 ${className}`}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-[15px] font-semibold">{title}</h2>
            {hint && <span className="text-xs text-ink-3">{hint}</span>}
          </div>
          <div className="flex items-center gap-2">
          {action}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`} aria-hidden>
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
          </div>
        </header>
      )}
      {open && <div className={title ? 'px-5 pb-5' : 'p-5'}>{children}</div>}
    </section>
  )
}

function PageHead({ title, text }: { title: string; text: string }) {
  return (
    <header className="border-b border-line bg-surface/92 px-5 py-4 backdrop-blur-2xl">
      <h1 className="font-display text-[20px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-2">{text}</p>
    </header>
  )
}

const idxDay = (ds: Dataset, i: number) => idxToDate(ds, i).toISOString().slice(0, 10)

const PHONE_QUERY = '(max-width: 767px)'
const isPhoneNow = () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches
/** True on phone-width screens; the mission view starts with its panels closed there so the Moon stays visible. */
function useIsPhone() {
  const [phone, setPhone] = useState(isPhoneNow)
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

const VERDICT_CHIP: Record<string, string> = {
  GO: 'bg-both text-white dark:text-bg',
  RISKY: 'bg-risk text-white dark:text-bg',
  'NO-GO': 'bg-nogo text-white dark:text-bg',
}

export default function Dashboard({ onNavigateHome }: { onNavigateHome?: () => void }) {
  const [rawDs, setDs] = useState<Dataset | null>(null)
  const [sunMode, setSunMode] = useState<SunMode>(DEFAULT_RULES.sunMode)
  const [earthMaskDeg, setEarthMaskDeg] = useState(DEFAULT_RULES.earthMaskDeg)
  const ds = useMemo(() => (rawDs ? withRules(rawDs, { sunMode, earthMaskDeg }) : null), [rawDs, sunMode, earthMaskDeg])
  const [lander, setLander] = useState<Lander>(EXAMPLE_LANDER)
  const [error, setError] = useState<string | null>(null)
  const [siteId, setSiteId] = useState('malapert')
  const [mission, setMission] = useState<Mission>({ startIdx: 0, durationH: 24 * 10, needComms: true, slipDays: 0 })
  const [cursor, setCursor] = useState(0)
  const [pickedCompare, setPickedCompare] = useState<string[] | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [planOn, setPlanOn] = useState(false)
  const [scenario, setScenario] = useState<Preset | null>(null)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [urlReady, setUrlReady] = useState(false)
  const [learnOn, setLearnOn] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const askButton = useRef<HTMLButtonElement>(null)
  const closeAsk = useCallback(() => { setAskOpen(false); askButton.current?.focus() }, [])
  const [moonMode, setMoonModeState] = useState<MoonMode>(readMoonMode)
  const [orbitPlaying, setOrbitPlaying] = useState(false)
  const setMoonMode = (m: MoonMode) => {
    setMoonModeState(m)
    try { sessionStorage.setItem(MOON_MODE_KEY, m) } catch { /* storage blocked: the choice lasts until reload */ }
  }

  // Google-Maps-style collapsible edge panels
  const [leftOpen, setLeftOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024)
  const [rightOpen, setRightOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1280)
  const isPhone = useIsPhone()
  const [topOpen, setTopOpen] = useState(() => !isPhoneNow())
  const [bottomOpen, setBottomOpen] = useState(() => !isPhoneNow())
  // On a phone only one side panel at a time: opening one closes the other.
  const toggleLeft = () => { const n = !leftOpen; setLeftOpen(n); if (n && isPhone) setRightOpen(false) }
  const toggleRight = () => { const n = !rightOpen; setRightOpen(n); if (n && isPhone) setLeftOpen(false) }
  const [overlayOpen, setOverlayOpen] = useState(true)

  const stageRef = useRef<HTMLDivElement>(null)
  const middleRef = useRef<HTMLDivElement>(null)
  const [mapInsets, setMapInsets] = useState({ top: 0, right: 0, bottom: 0, left: 0 })

  const [view, setViewState] = useState<View>(() => viewFromHash(location.hash))
  // Pages live in the URL hash so Back/Forward work and a shared link can open a page.
  const setView = useCallback((v: View) => {
    setViewState(v)
    setOverlayOpen(true)
    if (viewFromHash(location.hash) !== v) location.hash = v === 'mission' ? '' : v
    window.scrollTo({ top: 0 })
  }, [])
  useEffect(() => {
    const onHash = () => {
      setViewState(viewFromHash(location.hash))
      setOverlayOpen(true)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const navigateToTarget = useCallback((target: string) => {
    const v = TARGET_VIEW[target]
    if (isPhoneNow()) {
      // Phone: open only the panel that holds the step's target, so the Moon stays in view.
      setLeftOpen(target === 'slip-test')
      setRightOpen(false)
      setTopOpen(target === 'verdict')
      setBottomOpen(target === 'timeline')
    } else {
      setLeftOpen(true)
      setRightOpen(true)
      setTopOpen(true)
      setBottomOpen(true)
    }
    setOverlayOpen(true)
    if (v) setViewState((cur) => { if (cur !== v) { history.replaceState(history.state, '', `${location.pathname}${location.search}${v === 'mission' ? '' : '#' + v}`) } return v })
  }, [])

  const hasData = rawDs !== null

  // Keep MoonScene / SiteScene internal HUD controls aligned with the unobstructed map window.
  useEffect(() => {
    const stage = stageRef.current
    const mid = middleRef.current
    if (!stage || !mid) return
    const update = () => {
      const sr = stage.getBoundingClientRect()
      const mr = mid.getBoundingClientRect()
      if (sr.width === 0 || sr.height === 0) return
      setMapInsets({
        top: Math.max(0, Math.round(mr.top - sr.top)),
        left: Math.max(0, Math.round(mr.left - sr.left + 16)),
        right: Math.max(0, Math.round(sr.right - mr.right + 16)),
        bottom: Math.max(0, Math.round(sr.bottom - mr.bottom)),
      })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(stage)
    ro.observe(mid)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [leftOpen, rightOpen, topOpen, bottomOpen, view, scenario, hasData])

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
        if (fromUrl.earthMaskDeg !== undefined) setEarthMaskDeg(fromUrl.earthMaskDeg)
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
    for (const p of PRESETS) for (const msg of checkPreset(withRules(rawDs, { sunMode: p.sunMode, earthMaskDeg: p.earthMaskDeg ?? DEFAULT_RULES.earthMaskDeg }), p)) console.warn('[presets]', msg)
  }, [rawDs])

  const applyPlan = (st: PlanState) => {
    setSiteId(st.siteId)
    setSunMode(st.sunMode)
    setEarthMaskDeg(st.earthMaskDeg)
    setMission({ startIdx: st.startIdx, durationH: st.durationH, needComms: st.needComms, slipDays: st.slipDays })
    setCursor(st.startIdx)
  }

  const site = useMemo(() => ds?.sites.find((s) => s.id === siteId) ?? ds?.sites[0], [ds, siteId])
  // Sites on the Compare page: the viewer's own pick, kept in this browser; the original 6 by default.
  const compareIds = useMemo(() => pickedCompare ?? (ds ? loadCompareIds(ds) : []), [pickedCompare, ds])
  const setCompareIds = (ids: string[]) => { setPickedCompare(ids); saveCompareIds(ids) }
  const a = useMemo(() => (ds && site ? analyze(ds, site, mission.startIdx, mission) : null), [ds, site, mission])
  const slipped = useMemo(
    () => (ds && site && mission.slipDays > 0 ? analyze(ds, site, mission.startIdx + (mission.slipDays * 24) / ds.meta.stepHours, mission) : null),
    [ds, site, mission]
  )

  // Keep the address bar in sync with the plan (replaceState, debounced: no history entries, no reloads).
  const shareQuery = ds && site ? encodePlan(ds, { siteId: site.id, ...mission, sunMode, earthMaskDeg }) : null
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
    return { ds, site, mission, sunMode, earthMaskDeg, a, slipped, rows: compareSites(ds, mission, compareIds), link: shareLink, generatedAt: new Date(), name: `gnomon-${site.id}-${idxDay(ds, mission.startIdx)}` }
  }

  const isDark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)

  const appBar = (
    <header className="z-40 shrink-0 border-b border-line bg-surface/85 backdrop-blur-2xl backdrop-saturate-150">
      <div className="flex h-14 w-full items-center gap-3 px-3 lg:px-5">
        <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-[0.96]">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 5h12M3 9h12M3 13h12" /></svg>
        </button>
        <div className="flex min-w-0 items-baseline gap-3">
          <a
            href="/"
            onClick={(e) => {
              if (!onNavigateHome || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              e.preventDefault()
              onNavigateHome()
            }}
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
            aria-label="Gnomon home"
          >
            <GnomonMark height={20} />
            <span className="text-[20px] font-[450] tracking-[-0.01em] [font-family:'Fraunces_Variable',Georgia,serif]">Gnomon</span>
          </a>
          <span className="hidden truncate text-[13px] text-ink-3 2xl:inline">Lunar landing site navigator</span>
        </div>
        <ViewTabs value={view} onChange={setView} className="mx-auto hidden w-[440px] lg:block" />
        <div className="ml-auto flex items-center gap-1 sm:gap-2 lg:ml-0">
          <button
            ref={askButton}
            type="button"
            onClick={() => setAskOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={askOpen}
            title="Ask Five a question"
            className="flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-[0.96] sm:px-2.5"
          >
            <Five size={18} title="Five" />
            <span className="hidden md:inline">Ask Five</span>
            <span className="sr-only md:hidden">Ask Five</span>
          </button>
          <AskFive open={askOpen} onClose={closeAsk} />
          <button
            id="learn-button"
            onClick={() => {
              setLearnOn((v) => {
                if (!v && !isPhoneNow()) {
                  setLeftOpen(true)
                  setRightOpen(true)
                  setTopOpen(true)
                  setBottomOpen(true)
                  setOverlayOpen(true)
                }
                return !v
              })
            }}
            aria-pressed={learnOn}
            disabled={!ds}
            title="A guided tour of how lunar landing sites work"
            className={`flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-[0.96] disabled:opacity-40 sm:px-2.5 ${learnOn ? 'bg-surface-2 text-ink' : ''}`}
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
                      onSelect={() => { if (!st) return; applyPlan(st); setScenario(p); setTopOpen(true); close() }}
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
      <div className="border-t border-line px-4 py-2 lg:hidden">
        <ViewTabs value={view} onChange={setView} />
      </div>
    </header>
  )

  let body: React.ReactNode
  if (error) {
    body = <p className="p-8 text-nogo-ink">Couldn't load app/public/data/sites.json ({error}). Run <code>python pipeline/generate_mock.py</code> and reload.</p>
  } else if (!ds || !site || !a) {
    body = <p className="grid flex-1 place-items-center text-ink-3">Loading mission data…</p>
  } else {
    const setLanding = (idx: number) => {
      const i = clampIdx(ds, idx)
      setMission((m) => ({ ...m, startIdx: i }))
      setCursor(i)
    }
    const cur = Math.max(a.startIdx, Math.min(a.endIdx - 1, cursor))
    // Orbit timelapse playing: the top bar shows the mission so far, filling up as it plays.
    const soFar = moonMode === 'orbit' && orbitPlaying
      ? (() => {
          const steps = cur - a.startIdx + 1
          const days = (steps * ds.meta.stepHours) / 24
          return { a: analyze(ds, site, a.startIdx, { ...mission, durationH: steps * ds.meta.stepHours }), label: `So far: day ${Math.min(Math.ceil(days), Math.round(mission.durationH / 24))} of ${Math.round(mission.durationH / 24)}` }
        })()
      : null
    const stageVars = {
      '--map-top': `${mapInsets.top}px`,
      '--map-right': `${mapInsets.right}px`,
      '--map-bottom': `${mapInsets.bottom}px`,
      '--map-left': `${mapInsets.left}px`,
    } as React.CSSProperties

    body = (
      <div ref={stageRef} className="relative flex min-h-0 flex-1 overflow-hidden bg-[#05070c]" style={stageVars}>
        {/* Fullscreen 3D Moon / Site 3D viewport (Google Maps style background layer) */}
        <section id="moon-view" className="absolute inset-0 z-0 overflow-hidden bg-[#05070c]">
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-[#b3ac9f]">{moonMode === 'site3d' ? 'Loading terrain…' : 'Loading Moon…'}</div>}>
            {moonMode === 'globe'
              ? <MoonScene site={site} sites={ds.sites} idx={cur} time={idxToDate(ds, cur)} onSelect={setSiteId} />
              : moonMode === 'orbit'
              ? <OrbitScene ds={ds} site={site} cursor={cur} range={[a.startIdx, a.endIdx]} onCursor={setCursor} onPlayingChange={setOrbitPlaying} onSelect={setSiteId} />
              : <SiteScene
                  site={site}
                  idx={cur}
                  range={[a.startIdx, a.endIdx]}
                  stepsPerDay={24 / ds.meta.stepHours}
                  timeLabel={`${fmtDate(idxToDate(ds, cur))} · T+${fmtHours((cur - a.startIdx) * ds.meta.stepHours)}`}
                  onCursor={setCursor}
                />}
          </Suspense>
        </section>

        {/* Floating Full-Edged UI Layer over the Fullscreen Moon View */}
        <div className="pointer-events-none relative z-10 flex h-full w-full overflow-hidden">
          {/* Left Full-Edged Collapsible Sidebar: Landing site & Mission */}
          <div className={`pointer-events-auto relative z-30 flex h-full shrink-0 transition-[width] duration-200 ease-out max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 ${leftOpen ? 'w-[300px] max-md:w-[calc(100vw-40px)] sm:w-[320px]' : 'w-0'}`}>
            <div className="h-full w-full overflow-hidden">
              <aside
                aria-label="Landing site and mission controls"
                className={`flex h-full w-[300px] flex-col overflow-y-auto border-r border-line bg-surface/92 shadow-pop backdrop-blur-2xl backdrop-saturate-150 transition-transform duration-200 ease-out max-md:w-[calc(100vw-40px)] max-md:bg-surface/97 sm:w-[320px] ${leftOpen ? 'translate-x-0' : '-translate-x-full'}`}
              >
                <SidebarSection title="Landing site">
                  <SitePicker sites={ds.sites} value={site.id} onChange={setSiteId} />
                </SidebarSection>
                <SidebarSection title="Mission">
                  <MissionPanel
                    ds={ds}
                    mission={mission}
                    onChange={(m) => { setMission(m); if (m.startIdx !== mission.startIdx) setCursor(m.startIdx) }}
                    onBest={() => setLanding(bestLanding(ds, site, mission).idx)}
                    onPlan={() => { setPlanOn(true); setView('compare') }}
                    nowIndex={nowIdx(ds)}
                    onNow={(i) => setLanding(i)}
                    sunMode={sunMode}
                    onSunMode={setSunMode}
                    earthMaskDeg={earthMaskDeg}
                    onEarthMask={setEarthMaskDeg}
                  />
                </SidebarSection>
                <SidebarSection title="Power check">
                  <PowerCheck ds={ds} site={site} mission={mission} lander={lander} onChange={setLander} screen={a.verdict} />
                </SidebarSection>
              </aside>
            </div>
            <button
              type="button"
              onClick={toggleLeft}
              hidden={isPhone && rightOpen}
              aria-expanded={leftOpen}
              aria-label={leftOpen ? 'Collapse mission sidebar' : 'Expand mission sidebar'}
              title={leftOpen ? 'Collapse mission sidebar' : 'Expand mission sidebar'}
              className="absolute -right-6 top-1/2 z-30 flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-line bg-surface/95 text-ink-2 shadow-pop backdrop-blur-xl transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${leftOpen ? '' : 'rotate-180'}`} aria-hidden>
                <path d="M10 4L6 8l4 4" />
              </svg>
            </button>
          </div>

          {view === 'mission' ? (
            <>
              {/* Center Column: Top Verdict Bar, Unobstructed Middle Map Area, Bottom Timeline Bar */}
              <div className="pointer-events-none relative flex h-full min-w-0 flex-1 flex-col justify-between overflow-hidden">
                {/* Top Full-Edged Collapsible Verdict & Scenario Bar */}
                <div className="pointer-events-auto relative z-20 shrink-0">
                  {topOpen && (
                    <div id="verdict" className="border-b border-line bg-surface/92 shadow-pop backdrop-blur-2xl backdrop-saturate-150">
                      {scenario && (
                        <div className="border-b border-line px-4 py-2">
                          <ScenarioBanner scenario={scenario} onClose={() => setScenario(null)} />
                        </div>
                      )}
                      <SummaryStrip ds={ds} a={a} slipped={slipped} slipDays={mission.slipDays} needComms={mission.needComms} earthMaskDeg={earthMaskDeg} flush soFar={soFar} />
                    </div>
                  )}
                  {isPhone && !topOpen && (
                    <button
                      type="button"
                      onClick={() => setTopOpen(true)}
                      aria-expanded={false}
                      aria-label={`Verdict ${a.verdict} for ${site.name}, ${Math.round(mission.durationH / 24)} days. Show details`}
                      className="flex h-11 w-full items-center gap-2.5 border-b border-line bg-surface/92 px-3 text-left shadow-pop backdrop-blur-2xl backdrop-saturate-150"
                    >
                      <span className={`rounded-md px-2 py-0.5 font-display text-[13px] font-semibold ${VERDICT_CHIP[a.verdict]}`}>{a.verdict}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{site.name}</span>
                      <span className="shrink-0 text-[12px] tabular text-ink-3">{Math.round(mission.durationH / 24)} d · sun {Math.round(a.sunPct)}%</span>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3" aria-hidden><path d="M4 6l4 4 4-4" /></svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTopOpen((v) => !v)}
                    aria-expanded={topOpen}
                    aria-label={topOpen ? 'Collapse verdict bar' : 'Expand verdict bar'}
                    title={topOpen ? 'Collapse verdict bar' : 'Expand verdict bar'}
                    hidden={isPhone && !topOpen}
                    className="absolute -bottom-6 left-1/2 z-30 flex h-6 -translate-x-1/2 items-center gap-1.5 rounded-b-lg border border-t-0 border-line bg-surface/95 px-3 text-[11px] font-medium text-ink-2 shadow-pop backdrop-blur-xl transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <span>Verdict: {a.verdict}</span>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${topOpen ? '' : 'rotate-180'}`} aria-hidden>
                      <path d="M4 10l4-4 4 4" />
                    </svg>
                  </button>
                </div>

                {/* Middle Unobstructed Map Viewport */}
                <div ref={middleRef} className="pointer-events-none relative min-h-0 flex-1">
                  <MoonModeSwitch value={moonMode} onChange={setMoonMode} />
                  {moonMode === 'globe' && (
                    <div className="pointer-events-none absolute bottom-3 left-8 flex flex-wrap gap-4 text-xs text-[#b3ac9f]">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3ddc97]" />Landing site</span>
                      <span title="Earth and Sun are shown at their true sizes and directions from Horizons. Earth is at its real distance; the Sun is drawn closer but at its true apparent size. Earth's turn and cloud cover are illustrative.">Earth and Sun to scale</span>
                    </div>
                  )}
                </div>

                {/* Bottom Full-Edged Collapsible Timeline Bar */}
                <div className="pointer-events-auto relative z-20 shrink-0">
                  {isPhone && !bottomOpen && (
                    <div className="flex h-12 items-center gap-2.5 border-t border-line bg-surface/92 pl-3 pr-1.5 shadow-pop backdrop-blur-2xl backdrop-saturate-150">
                      <input type="range" className="min-w-0 flex-1" aria-label="Mission time" min={a.startIdx} max={a.endIdx - 1} value={cur} onChange={(e) => setCursor(+e.target.value)} />
                      <span className="w-16 shrink-0 text-right text-[12px] tabular text-ink-2">T+{fmtHours((cur - a.startIdx) * ds.meta.stepHours)}</span>
                      <button
                        type="button"
                        onClick={() => setBottomOpen(true)}
                        aria-label="Expand timeline"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 10l4-4 4 4" /></svg>
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    hidden={isPhone && !bottomOpen}
                    onClick={() => setBottomOpen((v) => !v)}
                    aria-expanded={bottomOpen}
                    aria-label={bottomOpen ? 'Collapse timeline' : 'Expand timeline'}
                    title={bottomOpen ? 'Collapse timeline' : 'Expand timeline'}
                    className="absolute -top-6 left-1/2 z-30 flex h-6 -translate-x-1/2 items-center gap-1.5 rounded-t-lg border border-b-0 border-line bg-surface/95 px-3 text-[11px] font-medium text-ink-2 shadow-pop backdrop-blur-xl transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <span>Timeline · T+{fmtHours((cur - a.startIdx) * ds.meta.stepHours)}</span>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${bottomOpen ? '' : 'rotate-180'}`} aria-hidden>
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </button>
                  {bottomOpen && (
                    <section id="timeline" className="border-t border-line bg-surface/92 px-4 py-3 shadow-pop backdrop-blur-2xl backdrop-saturate-150">
                      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <h2 className="font-display text-[15px] font-semibold">Timeline</h2>
                        <span className="text-xs text-ink-3">Drag to move the landing. Solid box: mission. Dashed box: delayed landing.</span>
                      </header>
                      <Timeline ds={ds} site={site} mission={mission} cursor={cur} onLanding={setLanding} onCursor={setCursor} />
                      <label className="mt-3 flex items-center gap-3 text-sm text-ink-2">
                        <span className="shrink-0">Mission time</span>
                        <input type="range" className="w-full" min={a.startIdx} max={a.endIdx - 1} value={cur} onChange={(e) => setCursor(+e.target.value)} />
                        <span className="w-24 shrink-0 text-right tabular">T+{fmtHours((cur - a.startIdx) * ds.meta.stepHours)}</span>
                      </label>
                    </section>
                  )}
                </div>
              </div>

              {/* Right Full-Edged Collapsible Sidebar: Site Brief */}
              <div className={`pointer-events-auto relative z-30 flex h-full shrink-0 transition-[width] duration-200 ease-out max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 ${rightOpen ? 'w-[300px] max-md:w-[calc(100vw-40px)] sm:w-[320px]' : 'w-0'}`}>
                <button
                  type="button"
                  onClick={toggleRight}
                  hidden={isPhone && leftOpen}
                  aria-expanded={rightOpen}
                  aria-label={rightOpen ? 'Collapse site brief sidebar' : 'Expand site brief sidebar'}
                  title={rightOpen ? 'Collapse site brief sidebar' : 'Expand site brief sidebar'}
                  className="absolute -left-6 top-1/2 z-30 flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-line bg-surface/95 text-ink-2 shadow-pop backdrop-blur-xl transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${rightOpen ? '' : 'rotate-180'}`} aria-hidden>
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </button>
                <div className="h-full w-full overflow-hidden">
                  <aside
                    aria-label="Selected site details"
                    className={`h-full w-[300px] overflow-y-auto border-l border-line bg-surface/92 shadow-pop backdrop-blur-2xl backdrop-saturate-150 transition-transform duration-200 ease-out max-md:w-[calc(100vw-40px)] max-md:bg-surface/97 sm:w-[320px] ${rightOpen ? 'translate-x-0' : 'translate-x-full'}`}
                  >
                    <SiteBrief ds={ds} site={site} idx={cur} flush />
                    <LandingArea ds={ds} site={site} mission={mission} rules={{ sunMode, earthMaskDeg }} />
                  </aside>
                </div>
              </div>
            </>
          ) : (
            /* Compare, Calendar & Analysis: Full-edged collapsible drawer over the Moon View */
            <div ref={middleRef} className="pointer-events-none relative flex h-full min-w-0 flex-1 justify-end overflow-hidden">
              <MoonModeSwitch value={moonMode} onChange={setMoonMode} />
              <div className={`pointer-events-auto relative z-30 flex h-full transition-[width] duration-200 ease-out ${overlayOpen ? 'w-full' : 'w-0'}`}>
                <button
                  type="button"
                  onClick={() => setOverlayOpen((v) => !v)}
                  aria-expanded={overlayOpen}
                  aria-label={overlayOpen ? `Collapse ${view} panel` : `Expand ${view} panel`}
                  title={overlayOpen ? `Collapse ${view} panel to see Moon` : `Expand ${view} panel`}
                  className="absolute -left-6 top-1/2 z-30 flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-line bg-surface/95 text-ink-2 shadow-pop backdrop-blur-xl transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${overlayOpen ? '' : 'rotate-180'}`} aria-hidden>
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </button>
                <div className="h-full w-full overflow-hidden">
                  <main className={`flex h-full w-full flex-col overflow-y-auto border-l border-line bg-surface/92 shadow-pop backdrop-blur-2xl backdrop-saturate-150 transition-transform duration-200 ease-out ${overlayOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                    {scenario && (
                      <div className="border-b border-line px-5 py-2.5">
                        <ScenarioBanner scenario={scenario} onClose={() => setScenario(null)} />
                      </div>
                    )}

                    {view === 'compare' && (
                      <>
                        <PageHead
                          title="Compare sites"
                          text={`Every site with the same landing, ${fmtDate(idxToDate(ds, mission.startIdx))}, for a ${Math.round(mission.durationH / 24)}-day mission that needs ${mission.needComms ? 'both sunlight and a view of Earth' : 'sunlight'}.`}
                        />
                        <Panel id="all-sites" title="Sites" action={<CompareSites sites={ds.sites} ids={compareIds} onChange={setCompareIds} chips={false} />}>
                          <CompareTable
                            ds={ds}
                            mission={mission}
                            ids={compareIds}
                            selectedId={site.id}
                            onSelect={setSiteId}
                            onRemove={(id) => { if (compareIds.length > 1) setCompareIds(compareIds.filter((x) => x !== id)) }}
                            onLanding={setLanding}
                          />
                        </Panel>
                        <Panel id="planner" title="Not sure when to land?" hint="Search every site and landing time for these settings">
                          <PlanPanel
                            ds={ds}
                            mission={mission}
                            siteId={site.id}
                            todayIdx={nowIdx(ds)}
                            active={planOn}
                            onActivate={() => setPlanOn(true)}
                            onUse={(id, idx) => { setSiteId(id); setLanding(idx); setView('mission') }}
                          />
                        </Panel>
                      </>
                    )}

                    {view === 'calendar' && (
                      <>
                        <PageHead title={`Launch calendar: ${site.name}`} text="Each day is a mission that lands at 00:00 UTC with your current settings. Click a day to land then." />
                        <Panel id="launch-calendar" title="Calendar">
                          <LaunchCalendar ds={ds} site={site} mission={mission} todayIdx={nowIdx(ds)} onPick={setLanding} />
                        </Panel>
                      </>
                    )}

                    {view === 'analysis' && (
                      <>
                        <PageHead title={`Analysis: ${site.name}`} text="Why the site is lit or dark: the skyline around it, and where the Sun and Earth are during the mission." />
                        <Panel id="sky-view" title="Sky view" hint="Standing at the site: the skyline, with the Sun and Earth at the mission time">
                          <SkyView ds={ds} site={site} a={a} cursor={cur} onCursor={setCursor} />
                        </Panel>
                        <div className="grid divide-y divide-line xl:grid-cols-2 xl:divide-x xl:divide-y-0">
                          <Panel id="horizon-view" title="Horizon view" hint="Terrain around the site, with the Sun and Earth paths">
                            <Panorama site={site} a={a} cursor={cur} />
                          </Panel>
                          <Panel title="Elevation during the mission" hint="Above the shaded terrain means visible">
                            <ElevationChart ds={ds} site={site} a={a} cursor={cur} />
                          </Panel>
                        </div>
                      </>
                    )}
                  </main>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-dvh w-screen flex-col overflow-hidden bg-bg">
        {appBar}
        {body}
        <Toast message={toast} onDone={clearToast} />
        <LearnTour open={learnOn && !!ds} onClose={closeLearn} onNavigate={navigateToTarget} />
        <Menu open={menuOpen} onClose={() => setMenuOpen(false)} theme={theme} setTheme={setTheme} ds={ds} />
      </div>
    </MotionConfig>
  )
}
