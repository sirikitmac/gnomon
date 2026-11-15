import { motion, useInView, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import Lenis from 'lenis'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import GnomonMark from './components/GnomonMark'
import Five, { type FiveMode } from './landing/Five'
import AskFive from './landing/AskFive'
import BlurText from './landing/BlurText'
import TeamBadges, { type Member } from './landing/TeamBadges'
import { useTheme } from './lib/theme'
import '@fontsource-variable/manrope'
import '@fontsource-variable/fraunces/opsz.css'
import './landing/landing.css'

const MoonStage = lazy(() => import('./landing/MoonStage'))

const EASE = [0.23, 1, 0.32, 1] as const

/* ---------- content ---------- */

const NAV = [
  ['how', 'How it works'],
  ['features', 'Features'],
  ['use', 'How to use'],
  ['validation', 'Validation'],
] as const

const WITHOUT = [
  'Sun and Earth positions from Horizons, one site at a time',
  'Terrain and lighting layers in Moon Trek and Quickmap',
  'Dates cross-checked by hand',
  'A launch slip means starting over',
]
const WITH = [
  'GO, RISKY or NO-GO for any site and date',
  'Sunlight and Earth contact on one timeline',
  'Every site side by side for the same dates',
  'The Slip Test shows what a delay does',
]

const STEPS = [
  { n: '1', title: 'Where the Sun and Earth are', body: 'JPL Horizons gives their direction and height in the sky at each site, every 2 hours from November 2026 to December 2028.' },
  { n: '2', title: 'What the terrain blocks', body: 'NASA LOLA terrain gives each site a 360° skyline, including the Moon’s curvature. Anything below it is hidden.' },
  { n: '3', title: 'What it means for the mission', body: 'Gnomon counts sunlight and Earth contact over your mission, then gives a screening verdict and a battery check for your lander.' },
]

const USE = [
  { title: 'Choose a site', body: 'Pick one of nine sites in the left panel, from Apollo 11 to the Artemis III candidates near the south pole.' },
  { title: 'Set the landing', body: 'Enter the landing date and mission length. Turn on comms if the lander must talk to Earth directly.' },
  { title: 'Read the verdict', body: 'GO, RISKY or NO-GO at the top, with sunlight, Earth contact and the longest blackout.' },
  { title: 'Check your lander', body: 'Enter battery, power draw and array output in Power check. Landing area shows the verdict around the touchdown point.' },
  { title: 'Test a delay', body: 'Drag the Slip Test to move the landing, or open Calendar to see every good landing day.' },
  { title: 'Compare and share', body: 'Rank sites for the same dates in Compare, then share a link or a printable report.' },
]

const FEATURES = [
  {
    tag: 'Verdict',
    title: 'Know in one line if a landing works.',
    body: 'GO, RISKY or NO-GO, with how much of the mission has sunlight and Earth in view and the longest blackout. Then check it against your own lander and the ground around the landing point.',
    points: ['Battery check from your lander’s specs', 'Verdict across the landing area', 'Countdown to sunset and Earthset'],
    img: '/landing/mission.webp',
    alt: 'Gnomon mission page for Malapert Massif with the verdict strip, 3D Moon and site brief',
  },
  {
    tag: 'Slip Test',
    title: 'See what a delay does before it happens.',
    body: 'Launches slip. Drag the Slip Test and the verdict updates for the new date.',
    points: ['Delays of 1 to 14 days', 'Calendar of GO, RISKY and NO-GO days', 'Best landing date in one click'],
    img: '/landing/calendar.webp',
    alt: 'Gnomon launch calendar coloring each day by verdict',
  },
  {
    tag: 'Compare',
    title: 'Every site, the same dates, side by side.',
    body: 'Rank sites for the same mission and see the trade-offs at once: more sunlight here, a steadier link to Earth there.',
    points: ['Sunlight, Earth contact and both', 'Delay column for every site', 'Shareable link and report'],
    img: '/landing/compare.webp',
    alt: 'Gnomon compare page ranking landing sites for the same dates',
  },
  {
    tag: 'Site 3D',
    title: 'Watch the shadows move across the real terrain.',
    body: 'LOLA terrain around the landing point, lit for the selected time. Press Play mission to watch the shadows cross the site.',
    points: ['Mission timelapse', 'Sunlit-area map around the landing point', 'Heights true to scale'],
    img: '/landing/site3d.webp',
    alt: 'Gnomon Site 3D view of the terrain around Malapert with the landing point marked',
  },
]

// 2-year averages from our dataset (Nov 2026 – Dec 2028, every 2 h).
const SITES = [
  { name: 'Shackleton–de Gerlache Ridge', role: 'Sunniest', sun: 82, earth: 49 },
  { name: 'Malapert Massif', role: 'Artemis III candidate', sun: 66, earth: 99.9 },
  { name: 'Near Shackleton', role: "Chang'e-7 target", sun: 55, earth: 57 },
  { name: 'Mons Mouton', role: 'IM-2 Athena', sun: 45, earth: 82 },
  { name: 'Nobile Rim 2', role: 'Artemis III candidate', sun: 33, earth: 27 },
  { name: 'Haworth', role: 'Next to ice, little light', sun: 8, earth: 40 },
  { name: 'Chandrayaan-3', role: 'Shiv Shakti point', sun: 48, earth: 100 },
  { name: 'Apollo 11', role: 'Tranquility Base', sun: 50, earth: 100 },
  { name: "Chang'e-4", role: 'Far side, no Earth', sun: 51, earth: 0 },
]

const FIVE_LINES = [
  'Hi, I’m Five. Tap me for a Moon fact.',
  'Malapert Massif sees Earth 99.9% of the time.',
  'Haworth sits next to ice, but gets sunlight only 8% of the time.',
  'On the far side, Earth never rises. Chang’e-4 needed a relay satellite.',
  'At the south pole the Sun never climbs more than a few degrees.',
]

const TEAM: Member[] = [
  { name: 'Sirikit', role: 'Lead Front-end Developer & UI/UX Designer', photo: '/team/sirikit.webp' },
  { name: 'Sherie', role: 'Data Analyst & Mobile Developer', photo: '/team/sherie.webp' },
  { name: 'Jiandale', role: 'AI & Backend Lead', photo: '/team/jiandale.webp' },
  { name: 'Jodenn', role: 'Lunar Science Researcher', photo: '/team/jodenn.webp' },
  { name: 'Rene', role: 'Media & Presentation Lead', photo: '/team/rene.webp' },
  { name: 'Andi', role: 'Animator & Storyteller', photo: '/team/andi.webp' },
]

/* ---------- helpers ---------- */

let lenis: Lenis | null = null
const scrollToId = (id: string) => {
  const el = document.getElementById(id)
  if (!el) return
  if (lenis) lenis.scrollTo(el, { offset: -24, duration: 1.2 })
  else el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function useSmoothScroll(reduce: boolean) {
  useEffect(() => {
    if (reduce) return
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true })
    let id = 0
    const raf = (t: number) => { lenis?.raf(t); id = requestAnimationFrame(raf) }
    id = requestAnimationFrame(raf)
    return () => { cancelAnimationFrame(id); lenis?.destroy(); lenis = null }
  }, [reduce])
}

/** Fades and lifts its children in once, the first time they scroll into view. */
function Reveal({ children, delay = 0, className, y = 18 }: { children: React.ReactNode; delay?: number; className?: string; y?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

function Arrow({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3.5 8h9M8.5 4l4 4-4 4" />
    </svg>
  )
}

function OpenButton({ onOpen, label = 'Launch the app', variant = 'sun' }: { onOpen: () => void; label?: string; variant?: 'sun' | 'ink' }) {
  return (
    <a
      href="/dashboard"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        onOpen()
      }}
      className={`pill ${variant === 'sun' ? 'pill-sun' : 'pill-ink'}`}
    >
      {label}
      <span className="knob"><Arrow /></span>
    </a>
  )
}

function ThemeToggle() {
  const [pref, setPref] = useTheme()
  const [sysDark, setSysDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSysDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const dark = pref === 'dark' || (pref === 'system' && sysDark)
  return (
    <button
      type="button"
      onClick={() => setPref(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="relative grid h-11 w-11 place-items-center rounded-full text-[var(--ink)] transition-[background-color,transform] duration-150 hover:bg-[var(--card-2)] active:scale-[0.94]"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <motion.g initial={false} animate={{ opacity: dark ? 0 : 1, scale: dark ? 0.6 : 1, rotate: dark ? -45 : 0 }} transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }} style={{ transformOrigin: '12px 12px' }}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
        </motion.g>
        <motion.path
          d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"
          initial={false}
          animate={{ opacity: dark ? 1 : 0, scale: dark ? 1 : 0.6, rotate: dark ? 0 : 45 }}
          transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }}
          style={{ transformOrigin: '12px 12px' }}
        />
      </svg>
    </button>
  )
}

/* ---------- sections ---------- */

function Nav({ onOpen, askOpen, onAskFive }: { onOpen: () => void; askOpen: boolean; onAskFive: () => void }) {
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const on = () => setSolid(window.scrollY > window.innerHeight * 0.6)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
      className="fixed inset-x-0 top-3 z-50 px-3 sm:top-5 sm:px-5"
    >
      <nav
        aria-label="Main"
        className={`mx-auto flex h-[60px] max-w-[1240px] items-center justify-between rounded-full pl-4 pr-2 backdrop-blur-xl backdrop-saturate-150 transition-[background-color,box-shadow] duration-300 bg-[var(--nav)] ${solid ? 'shadow-[0_0_0_1px_var(--line),0_10px_30px_-18px_rgb(0_0_0/0.35)]' : 'shadow-[0_0_0_1px_var(--line)]'}`}
      >
        <a href="#top" onClick={(e) => { e.preventDefault(); lenis ? lenis.scrollTo(0, { duration: 1.2 }) : window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="flex items-center gap-2.5" aria-label="Gnomon home">
          <GnomonMark height={24} />
          <span className="brand text-[21px] sm:text-[23px]">Gnomon</span>
        </a>
        <ul className="hidden items-center gap-1 md:flex">
          {NAV.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} onClick={(e) => { e.preventDefault(); scrollToId(id) }} className="rounded-full px-3.5 py-2 text-[14px] font-semibold tracking-[-0.02em] text-[var(--ink-2)] transition-colors duration-150 hover:text-[var(--ink)]">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={onAskFive}
            aria-haspopup="dialog"
            aria-expanded={askOpen}
            aria-label="Ask Five"
            title="Ask Five"
            className="grid h-11 w-11 place-items-center rounded-full transition-[background-color,transform] duration-150 hover:bg-[var(--card-2)] active:scale-[0.94]"
          >
            <Five size={24} title="Ask Five" />
          </button>
          <ThemeToggle />
          <a
            href="/dashboard"
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.button !== 0) return; e.preventDefault(); onOpen() }}
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-[var(--ink)] px-4 text-[14px] font-semibold tracking-[-0.02em] text-[var(--on-ink)] transition-transform duration-150 active:scale-[0.97] sm:px-5"
          >
            Launch app
          </a>
        </div>
      </nav>
    </motion.header>
  )
}

function Hero({ onOpen, reduce }: { onOpen: () => void; reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const textOpacity = useTransform(scrollYProgress, [0, 0.32], [1, 0])
  const textY = useTransform(scrollYProgress, [0, 0.32], [0, -60])
  const cardOpacity = useTransform(scrollYProgress, [0, 0.22], [1, 0])
  const hintOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0])
  const lineOpacity = useTransform(scrollYProgress, [0.45, 0.62, 0.92, 1], [0, 1, 1, 0.6])
  const lineY = useTransform(scrollYProgress, [0.45, 0.62], [24, 0])

  return (
    <section id="top" ref={ref} className="relative h-[230vh]" aria-label="Gnomon">
      <div className="sticky top-0 h-[100svh]">
        <div className="relative h-full overflow-hidden">

          {/* Headline block */}
          <motion.div style={{ opacity: textOpacity, y: textY }} className="absolute inset-x-0 bottom-0 px-5 pb-8 sm:px-10 sm:pb-12 lg:px-14 lg:pb-14">
            <div className="max-w-[760px]">
              <BlurText
                as="h1"
                onLoad
                delay={0.25}
                stagger={0.08}
                text="Find where the Moon stays lit."
                className="display brand-display text-[clamp(38px,6.1vw,92px)] text-[var(--cream)]"
              />
              <motion.p
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.5 }}
                className="mt-5 max-w-[34ch] text-[17px] font-medium leading-[1.5] tracking-[-0.015em] text-[#fffdf6]/75 sm:text-[19px]"
              >
                Gnomon checks any lunar landing site and date in seconds: sunlight for power, Earth in view for contact, and what happens if the launch slips.
              </motion.p>
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: EASE, delay: 0.7 }}
                className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4"
              >
                <OpenButton onOpen={onOpen} />
                <a href="#how" onClick={(e) => { e.preventDefault(); scrollToId('how') }} className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-[#fffdf6]/85 transition-colors duration-150 hover:text-[var(--cream)]">
                  How it works <Arrow />
                </a>
              </motion.div>
              <p className="mt-10 text-[13px] font-semibold tracking-[-0.01em] text-[#fffdf6]/55">
                Built on NASA JPL Horizons and LRO LOLA data
              </p>
            </div>
          </motion.div>

          {/* Floating stat card, Kora-style */}
          <motion.aside
            style={{ opacity: cardOpacity }}
            initial={reduce ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.9 }}
            className="light absolute bottom-8 right-8 hidden w-[340px] rounded-[26px] bg-[color-mix(in_srgb,var(--card)_95%,transparent)] p-2 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.7)] backdrop-blur-xl lg:block"
            aria-label="Example site"
          >
            <div className="rounded-[20px] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between">
                <span className="chip">Malapert Massif</span>
                <span className="small text-[var(--ink-2)]">85.96°S</span>
              </div>
              <p className="mt-4 text-[14px] font-semibold leading-snug tracking-[-0.02em] text-[var(--ink)]">
                A NASA Artemis III candidate with an almost unbroken view of Earth.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              {[['66%', 'of the time in sunlight', 'var(--sun)'], ['99.9%', 'of the time Earth in view', '#3d7bd9']].map(([v, l, c]) => (
                <div key={l} className="rounded-[20px] bg-[var(--card)] p-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: c }} aria-hidden />
                    <span className="tabular text-[26px] font-semibold tracking-[-0.04em] text-[var(--ink)]">{v}</span>
                  </div>
                  <p className="small mt-1 text-[var(--ink-2)]">{l}</p>
                </div>
              ))}
            </div>
            <p className="px-3 pb-1 pt-2.5 text-[11.5px] font-semibold tracking-[-0.01em] text-[var(--ink-2)]">2-year average, Nov 2026 to Dec 2028</p>
          </motion.aside>

          {/* Scroll hint */}
          <motion.div style={{ opacity: hintOpacity }} className="pointer-events-none absolute left-1/2 top-24 hidden -translate-x-1/2 items-center gap-2 text-[12.5px] font-semibold tracking-[-0.01em] text-[#fffdf6]/60 lg:flex">
            Scroll to move the Sun
          </motion.div>

          {/* Mid-scroll line while the light sweeps. A soft oval shade sits behind just the text and fades
              out on every side, so no edge shows across the Moon as the hero scrolls away. */}
          <motion.div
            style={{ opacity: lineOpacity, y: lineY }}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-[radial-gradient(ellipse_46%_38%_at_50%_80%,rgb(7_9_13/0.82),rgb(7_9_13/0.5)_45%,transparent_100%)] sm:bg-[radial-gradient(ellipse_34%_32%_at_50%_80%,rgb(7_9_13/0.8),rgb(7_9_13/0.45)_45%,transparent_100%)]"
            aria-hidden
          />
          <motion.p
            style={{ opacity: lineOpacity, y: lineY }}
            className="pointer-events-none absolute inset-x-0 bottom-10 px-6 text-center text-[clamp(22px,2.6vw,34px)] font-normal tracking-[-0.035em] text-[var(--cream)] sm:bottom-14"
          >
            As the Sun moves, the light on every crater changes.<br className="hidden sm:block" /> Gnomon tells you where it lasts.
          </motion.p>
        </div>
      </div>
    </section>
  )
}

function Word({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.16, 1])
  const filter = useTransform(progress, range, ['blur(6px)', 'blur(0px)'])
  return <><motion.span className="inline-block" style={{ opacity, filter }}>{children}</motion.span> </>
}

function Statement() {
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] })
  const text = 'At the Moon’s south pole the Sun never climbs more than a few degrees. One ridge on the horizon decides whether a lander has power, and a few days’ delay can decide whether it survives.'
  const words = text.split(' ')
  return (
    <section id="statement" className="relative mx-auto max-w-[1100px] px-5 py-[22vh] sm:px-8">
      <p ref={ref} className="h2 text-[var(--ink)]">
        {words.map((w, i) => (
          <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>{w}</Word>
        ))}
      </p>
    </section>
  )
}

function Check({ dark }: { dark?: boolean }) {
  return (
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${dark ? 'bg-[var(--sun)] text-[var(--cream)]' : 'bg-[var(--card-2)] text-[var(--ink-2)]'}`} aria-hidden>
      {dark ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2l2.3 2.3 4.7-5" /></svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" /></svg>
      )}
    </span>
  )
}

function BeforeAfter() {
  return (
    <section id="compare" className="relative mx-auto max-w-[760px] px-5 pb-[16vh] sm:px-8" aria-label="Without and with Gnomon">
      <div className="sticky top-24 sm:top-28">
        <div className="glass p-7 sm:p-10">
          <p className="small text-[var(--ink-2)]">Without Gnomon</p>
          <BlurText as="h3" className="h3 mt-3 max-w-[18ch]" text="Hours across three NASA tools." />
          <ul className="mt-16 flex flex-col gap-3.5 sm:mt-24">
            {WITHOUT.map((t) => (
              <li key={t} className="flex items-center gap-3 text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink-2)]"><Check />{t}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="sticky top-32 mt-[40vh] sm:top-36">
        <div className="card relative overflow-hidden p-7 shadow-[0_40px_90px_-40px_rgb(0_0_0/0.9)] sm:p-10">
          <p className="small text-[var(--ink-2)]">With Gnomon</p>
          <BlurText as="h3" className="h3 mt-3 max-w-[18ch]" text="A verdict in seconds." />
          <ul className="mt-16 flex flex-col gap-3.5 sm:mt-24">
            {WITH.map((t) => (
              <li key={t} className="flex items-center gap-3 text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]"><Check dark />{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -20% 0px' })
  return (
    <section id="how" className="relative mx-auto max-w-[1240px] scroll-mt-28 px-5 py-[14vh] sm:px-8">
      <div ref={ref} className="flex flex-wrap items-end justify-between gap-8">
        <Reveal>
          <BlurText className="h2 max-w-[16ch]" text="From NASA data to a verdict." />
        </Reveal>
        <div className="hidden sm:block">{inView && <Five size={112} draw mode="idle" title="Five drawing itself" />}</div>
      </div>
      <ol className="mt-14 grid gap-3 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.n}><Reveal delay={i * 0.1} className="h-full">
            <div className="glass flex h-full flex-col p-7">
              <span className="tabular text-[15px] font-semibold text-[var(--ink-2)]">{s.n}</span>
              <h3 className="mt-10 text-[24px] font-[450] leading-[1.15] tracking-[-0.035em]">{s.title}</h3>
              <p className="body mt-3">{s.body}</p>
            </div>
          </Reveal></li>
        ))}
      </ol>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="relative mx-auto max-w-[1240px] scroll-mt-28 px-5 pb-[10vh] sm:px-8">
      <Reveal>
        <BlurText className="h2 max-w-[20ch]" text="What a landing team asks, answered on one screen." />
      </Reveal>
      <div className="mt-14 flex flex-col gap-4">
        {FEATURES.map((f, i) => (
          <div key={f.tag} className="lg:sticky" style={{ top: 96 + i * 22 }}>
            <article className="card grid gap-6 p-3 lg:grid-cols-[0.82fr_1.18fr] lg:p-3">
              <div className="flex flex-col p-4 sm:p-6">
                <p className="small text-[var(--ink-2)]">{f.tag}</p>
                <BlurText as="h3" className="h3 mt-3" text={f.title} />
                <p className="body mt-4">{f.body}</p>
                <ul className="mt-auto flex flex-col gap-2.5 pt-8">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-[14px] font-semibold tracking-[-0.02em]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink)]" aria-hidden />{p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="shot aspect-[16/10] lg:aspect-auto lg:h-[480px]">
                <img src={f.img} alt={f.alt} loading="lazy" decoding="async" width={1600} height={1000} />
              </div>
            </article>
          </div>
        ))}
      </div>
    </section>
  )
}

function HowToUse({ onOpen }: { onOpen: () => void }) {
  return (
    <section id="use" className="mx-auto max-w-[1240px] scroll-mt-28 px-5 py-[14vh] sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <BlurText className="h2 max-w-[12ch]" text="How to use Gnomon" />
          <p className="body mt-5 max-w-[36ch]">Six steps from opening the app to a plan you can share. Most take a few seconds.</p>
          <div className="mt-8"><OpenButton onOpen={onOpen} /></div>
        </div>
        <ol className="grid gap-x-10 sm:grid-cols-2">
          {USE.map((u, i) => (
            <li key={u.title} className="border-t border-[var(--line)] py-7">
              <Reveal delay={(i % 2) * 0.06}>
                <div className="flex items-baseline gap-4">
                  <span className="tabular w-5 shrink-0 text-[15px] font-semibold text-[var(--sun)]">{i + 1}</span>
                  <div>
                    <h3 className="text-[20px] font-semibold leading-tight tracking-[-0.03em]">{u.title}</h3>
                    <p className="body mt-2">{u.body}</p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Validation() {
  return (
    <section id="validation" className="scroll-mt-24 px-2 py-[8vh] sm:px-3">
      <div className="space-panel relative overflow-hidden rounded-[28px] bg-[var(--space)] px-5 py-[12vh] text-[var(--cream)] sm:rounded-[36px] sm:px-10 lg:px-14">
        <div className="pointer-events-none absolute -right-[18%] -top-[30%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_35%_35%,rgb(210_80_42/0.28),transparent_60%)]" aria-hidden />
        <div className="relative mx-auto max-w-[1180px]">
          <Reveal>
            <BlurText className="h2 max-w-[22ch]" text="We checked our math against JPL’s and NASA’s own." />
          </Reveal>
          <div className="mt-16 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-end">
            <Reveal>
              <p className="tabular text-[clamp(72px,12vw,168px)] font-normal leading-[0.9] tracking-[-0.06em]">0.0005°</p>
              <p className="mt-5 max-w-[42ch] text-[16px] font-medium leading-[1.55] tracking-[-0.012em] text-[#fffdf6]/70">
                The largest difference between our Sun and Earth positions (JPL Horizons, DE441) and our own calculation from JPL’s separate DE421 ephemeris. That is a thousand times smaller than the Sun’s disc.
              </p>
            </Reveal>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['2.1 pts', 'average gap between our sunlight and NASA’s polar illumination maps (PGDA), 7 polar sites'],
                ['7 of 7', 'polar sites where our sunlight falls inside NASA’s own range within 500 m'],
                ['170,874', 'Sun and Earth positions checked, at all 9 sites'],
                ['2 years', 'of positions, every 2 hours from Nov 2026 to Dec 2028'],
              ].map(([v, l], i) => (
                <Reveal key={l} delay={i * 0.08}>
                  <div className="h-full rounded-[22px] bg-white/[0.06] p-5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
                    <p className="tabular text-[30px] font-normal tracking-[-0.04em]">{v}</p>
                    <p className="mt-1 text-[13.5px] font-semibold leading-snug tracking-[-0.01em] text-[#fffdf6]/65">{l}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Sites() {
  const row = [...SITES, ...SITES]
  return (
    <section className="py-[12vh]" aria-label="Landing sites">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <Reveal>
          <BlurText className="h2 max-w-[20ch]" text="Nine sites, from the sunniest ridge to a place Earth never rises." />
        </Reveal>
      </div>
      <div className="marquee-wrap mt-12 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
        <ul className="marquee flex w-max gap-3 px-3">
          {row.map((s, i) => (
            <li key={i} aria-hidden={i >= SITES.length} className="card w-[280px] shrink-0 p-6">
              <p className="small text-[var(--ink-2)]">{s.role}</p>
              <p className="mt-2 text-[20px] font-semibold leading-tight tracking-[-0.035em]">{s.name}</p>
              <div className="mt-8 flex flex-col gap-3">
                {([['Sunlight', s.sun, 'var(--sun)'], ['Earth in view', s.earth, '#3d7bd9']] as const).map(([l, v, c]) => (
                  <div key={l}>
                    <div className="flex justify-between text-[13px] font-semibold tracking-[-0.01em]">
                      <span className="text-[var(--ink-2)]">{l}</span>
                      <span className="tabular">{v}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--card-2)]">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(v, 1)}%`, background: c }} />
                    </div>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="mx-auto mt-6 max-w-[1240px] px-5 text-[13px] font-semibold tracking-[-0.01em] text-[var(--ink-2)] sm:px-8">Share of time over Nov 2026 to Dec 2028, terrain included.</p>
    </section>
  )
}

function MeetFive({ askOpen, onOpenFive }: { askOpen: boolean; onOpenFive: () => void }) {
  const [mode, setMode] = useState<FiveMode>('idle')
  const [line, setLine] = useState(0)
  const speakTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(speakTimer.current), [])
  const openLive = () => {
    setLine((l) => (l + 1) % FIVE_LINES.length)
    setMode('speak')
    window.clearTimeout(speakTimer.current)
    speakTimer.current = window.setTimeout(() => setMode('idle'), 2600)
    onOpenFive()
  }
  return (
    <section id="five" className="mx-auto max-w-[1240px] scroll-mt-28 px-5 py-[10vh] sm:px-8">
      <div className="grid items-center gap-4 lg:grid-cols-2">
        <Reveal>
          <button
            type="button"
            onPointerEnter={() => mode !== 'speak' && setMode('listen')}
            onPointerLeave={() => mode !== 'speak' && setMode('idle')}
            onClick={openLive}
            aria-haspopup="dialog"
            aria-expanded={askOpen}
            className="group relative grid aspect-square w-full place-items-center rounded-[32px] bg-[var(--sand)] shadow-[0_0_0_1px_var(--line)] transition-transform duration-200 active:scale-[0.99]"
            aria-label="Talk to Five"
          >
            <Five size={260} mode={askOpen ? 'speak' : mode} title="Five" />
            <span className="absolute bottom-5 inline-flex items-center gap-2 rounded-full bg-[var(--card)]/90 px-4 py-2 text-[13px] font-semibold tracking-[-0.015em] text-[var(--ink)] shadow-[0_0_0_1px_var(--line)] backdrop-blur-sm transition-transform duration-200 group-hover:-translate-y-0.5">
              <span className="h-2 w-2 rounded-full bg-[var(--sun)]" aria-hidden />
              Tap to open Five Live
            </span>
          </button>
        </Reveal>
        <div className="p-2 sm:p-6 lg:pl-12">
          <Reveal>
            <BlurText className="h2" text="Meet Five, our guide to the Moon’s light." />
            <p className="body mt-6 max-w-[46ch]">
              Lagrange points are the five places where a small body can ride along with two big ones. Five is named after L5, which sits at the tip of an equilateral triangle: the triangle is Five, and the dot is the Sun. Tap Five to speak or type live about Gnomon’s lunar data.
            </p>
          </Reveal>
          <motion.button
            type="button"
            key={line}
            onClick={() => setLine((l) => (l + 1) % FIVE_LINES.length)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="mt-8 block max-w-[44ch] rounded-[22px] rounded-bl-[6px] bg-[var(--ink)] px-5 py-4 text-left text-[15px] font-semibold leading-snug tracking-[-0.02em] text-[var(--on-ink)]"
            aria-live="polite"
            title="Next Moon fact"
          >
            {FIVE_LINES[line]}
          </motion.button>
          <div className="mt-6">
            <button
              type="button"
              onClick={onOpenFive}
              aria-haspopup="dialog"
              aria-expanded={askOpen}
              className="pill pill-sun"
            >
              Talk to Five
              <span className="knob"><Arrow /></span>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function FinalCta({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="px-2 pb-2 pt-[6vh] sm:px-3 sm:pb-3">
      <div className="relative overflow-hidden rounded-[28px] bg-[var(--sand)] px-5 py-[14vh] text-center sm:rounded-[36px]">
        <Reveal>
          <BlurText stagger={0.07} className="display brand-display mx-auto max-w-[15ch] text-[clamp(36px,5.8vw,84px)]" text="Plan a landing in 30 seconds." />
          <p className="body mx-auto mt-5 max-w-[40ch]">Free, in the browser, no account needed.</p>
          <div className="mt-10 flex justify-center"><OpenButton onOpen={onOpen} /></div>
        </Reveal>
      </div>
      {/* Members area: the team's ID badges hang from the top edge on their lanyards */}
      <section id="team" aria-label="Team Lagrange Point" className="relative mt-2 overflow-hidden rounded-[28px] bg-[var(--card-2)] sm:mt-3 sm:rounded-[36px]">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
          <TeamBadges members={TEAM} />
          <div className="flex flex-col gap-4 pb-10 pt-2 sm:pb-14 lg:flex-row lg:items-end lg:justify-between">
            <BlurText as="h2" className="h2" text="Team Lagrange Point" />
            <p className="body max-w-[44ch] lg:text-right">Six students from Iligan City, Philippines, building for the 2026 NASA Space Apps Challenge.</p>
          </div>
        </div>
      </section>
      <footer className="mx-auto flex max-w-[1240px] flex-col gap-3 px-3 pb-6 pt-8 text-[13px] font-semibold tracking-[-0.01em] text-[var(--ink-2)] sm:flex-row sm:items-start sm:justify-between">
        <p className="flex items-center gap-2"><GnomonMark height={16} /><span><span className="brand text-[15px] text-[var(--ink)]">Gnomon</span> by Lagrange Point · NASA Space Apps Challenge 2026, Iligan</span></p>
        <p className="max-w-[60ch] sm:text-right">
          A student project, not an official NASA product. Data: JPL Horizons, LRO LOLA via NASA Goddard PGDA, NASA SVS CGI Moon Kit.
        </p>
      </footer>
    </section>
  )
}

export default function Landing({ onOpenDashboard }: { onOpenDashboard: () => void }) {
  const reduce = !!useReducedMotion()
  const [askOpen, setAskOpen] = useState(false)
  useSmoothScroll(reduce)
  // Pause smooth scrolling while the Ask Five Live window is open.
  useEffect(() => {
    if (askOpen) { lenis?.stop(); return }
    lenis?.start()
  }, [askOpen])
  const openAsk = useCallback(() => setAskOpen(true), [])
  const closeAsk = useCallback(() => setAskOpen(false), [])
  useEffect(() => {
    const prev = document.title
    document.title = 'Gnomon · Find where the Moon stays lit'
    return () => { document.title = prev }
  }, [])
  return (
    <div className="lnd min-h-screen">
      <Nav onOpen={onOpenDashboard} askOpen={askOpen} onAskFive={openAsk} />
      <main>
        {/* The "space" part: one Moon behind all of these sections, moving as you scroll */}
        <div className="zone relative mx-2 mt-2 overflow-clip rounded-[28px] sm:mx-3 sm:mt-3 sm:rounded-[36px]">
          <Suspense fallback={null}>
            <MoonStage reduce={reduce} />
          </Suspense>
          <Hero onOpen={onOpenDashboard} reduce={reduce} />
          <Statement />
          <BeforeAfter />
          <HowItWorks />
          <Features />
          <div id="zone-end" aria-hidden />
        </div>
        <HowToUse onOpen={onOpenDashboard} />
        <Validation />
        <Sites />
        <MeetFive askOpen={askOpen} onOpenFive={openAsk} />
        <FinalCta onOpen={onOpenDashboard} />
      </main>
      <AskFive open={askOpen} onClose={closeAsk} />
    </div>
  )
}
