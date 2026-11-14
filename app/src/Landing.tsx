import { motion, useInView, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import Lenis from 'lenis'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import Five, { type FiveMode } from './landing/Five'
import './landing/landing.css'

const HeroMoon = lazy(() => import('./landing/HeroMoon'))

const EASE = [0.23, 1, 0.32, 1] as const

/* ---------- content ---------- */

const NAV = [
  ['how', 'How it works'],
  ['features', 'Features'],
  ['validation', 'Validation'],
  ['five', 'Meet Five'],
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
  { n: '01', title: 'Pick a site and a date', body: 'Nine sites, from Apollo 11 to NASA’s Artemis III candidates at the south pole. Choose a landing time and how long the mission lasts.' },
  { n: '02', title: 'Lunalit runs the numbers', body: 'Sun and Earth positions every 2 hours from JPL Horizons, checked against a 360° skyline built from NASA LOLA terrain, including the Moon’s curvature.' },
  { n: '03', title: 'Get a decision', body: 'A verdict, the longest blackout, a countdown to sunset and Earthset, and plain-language advice on what to change.' },
]

const FEATURES = [
  {
    tag: 'Verdict',
    title: 'Know in one line if a landing works.',
    body: 'GO, RISKY or NO-GO, with how much of the mission has sunlight and Earth in view, the longest blackout, and advice built straight from those numbers.',
    points: ['Countdown to sunset and Earthset', 'Mission advice with one-click fixes', '3D Moon with the real Sun and Earth'],
    img: '/landing/mission.webp',
    alt: 'Lunalit mission page for Malapert Massif with the verdict strip, 3D Moon and site brief',
  },
  {
    tag: 'Slip Test',
    title: 'See what a delay does before it happens.',
    body: 'Launches slip. Drag the Slip Test and the verdict updates for the new date, or open the calendar to see every good landing day at a glance.',
    points: ['Slip from 1 to 14 days', 'Calendar of GO, RISKY and NO-GO days', 'Find the best date in one click'],
    img: '/landing/calendar.webp',
    alt: 'Lunalit launch calendar coloring each day by verdict',
  },
  {
    tag: 'Compare',
    title: 'Every site, the same dates, side by side.',
    body: 'Add or remove sites and rank them for the same mission. Planners see the trade-offs at once: more sunlight here, a steadier link to Earth there.',
    points: ['Sun, Earth and both, over the mission', 'Slip column for every site', 'Shareable link and report'],
    img: '/landing/compare.webp',
    alt: 'Lunalit compare page ranking landing sites for the same dates',
  },
  {
    tag: 'Site 3D',
    title: 'Watch the shadows move across the real terrain.',
    body: 'Real LOLA terrain around the landing point, lit for the selected time. Press Play mission and the Sun and Earth sweep the sky as shadows cross the site.',
    points: ['Play mission timelapse', 'Sunlit-area map around the landing point', 'Heights true to scale'],
    img: '/landing/site3d.webp',
    alt: 'Lunalit Site 3D view of the terrain around Malapert with the landing point marked',
  },
]

// 2-year averages from Lunalit's dataset (Nov 2026 – Dec 2028, every 2 h).
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
  'Hi, I’m Five. Hover over me and I’ll listen.',
  'Malapert Massif sees Earth 99.9% of the time.',
  'Haworth sits next to ice, but gets sunlight only 8% of the time.',
  'On the far side, Earth never rises. Chang’e-4 needed a relay satellite.',
  'At the south pole the Sun never climbs more than a few degrees.',
]

const TEAM = ['Sirikit', 'Sherie', 'Jiandale', 'Jodenn', 'Rene', 'Andi']

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

function OpenButton({ onOpen, label = 'Open Lunalit', variant = 'sun' }: { onOpen: () => void; label?: string; variant?: 'sun' | 'ink' }) {
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

/* ---------- sections ---------- */

function Nav({ onOpen }: { onOpen: () => void }) {
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
        className={`mx-auto flex h-[60px] max-w-[1240px] items-center justify-between rounded-full pl-4 pr-2 backdrop-blur-xl backdrop-saturate-150 transition-[background-color,box-shadow] duration-300 ${solid ? 'bg-[#fbf8f1]/90 shadow-[0_0_0_1px_rgb(34_31_28/0.08),0_10px_30px_-18px_rgb(34_31_28/0.35)]' : 'bg-[#fbf8f1]/80 shadow-[0_0_0_1px_rgb(34_31_28/0.06)]'}`}
      >
        <a href="#top" onClick={(e) => { e.preventDefault(); lenis ? lenis.scrollTo(0, { duration: 1.2 }) : window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="flex items-center gap-2.5" aria-label="Lunalit home">
          <Five size={30} title="" />
          <span className="text-[19px] font-semibold tracking-[-0.04em]">Lunalit</span>
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
        <a
          href="/dashboard"
          onClick={(e) => { if (e.metaKey || e.ctrlKey || e.button !== 0) return; e.preventDefault(); onOpen() }}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[14px] font-semibold tracking-[-0.02em] text-[var(--cream)] transition-transform duration-150 active:scale-[0.97]"
        >
          <span className="h-2 w-2 rounded-full bg-[var(--sun)]" aria-hidden />
          Open Lunalit
        </a>
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
    <section id="top" ref={ref} className="relative h-[230vh]" aria-label="Lunalit">
      <div className="sticky top-0 h-[100svh] p-2 sm:p-3">
        <div className="relative h-full overflow-hidden rounded-[28px] bg-[radial-gradient(120%_90%_at_70%_40%,#151a23_0%,#07090d_60%)] sm:rounded-[36px]">
          <Suspense fallback={null}>
            <HeroMoon progress={scrollYProgress} reduce={reduce} />
          </Suspense>

          {/* Headline block */}
          <motion.div style={{ opacity: textOpacity, y: textY }} className="absolute inset-x-0 bottom-0 px-5 pb-8 sm:px-10 sm:pb-12 lg:px-14 lg:pb-14">
            <div className="max-w-[760px]">
              <motion.h1
                initial={reduce ? false : { opacity: 0, y: 28, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1.1, ease: EASE, delay: 0.25 }}
                className="display text-[clamp(44px,7.4vw,104px)] text-[var(--cream)]"
              >
                Find where the Moon stays lit.
              </motion.h1>
              <motion.p
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.5 }}
                className="mt-5 max-w-[34ch] text-[17px] font-medium leading-[1.5] tracking-[-0.015em] text-[#fffdf6]/75 sm:text-[19px]"
              >
                Lunalit checks any lunar landing site and date in seconds: sunlight for power, Earth in view for contact, and what happens if the launch slips.
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
                Built on NASA data from JPL Horizons and LRO LOLA
              </p>
            </div>
          </motion.div>

          {/* Floating stat card, Kora-style */}
          <motion.aside
            style={{ opacity: cardOpacity }}
            initial={reduce ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.9 }}
            className="absolute bottom-8 right-8 hidden w-[340px] rounded-[26px] bg-[#fbf8f1]/95 p-2 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.7)] backdrop-blur-xl lg:block"
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
            <span className="hint-dot h-2 w-2 rounded-full bg-[var(--sun)]" aria-hidden />
            Scroll to move the Sun
          </motion.div>

          {/* Mid-scroll line while the light sweeps, over a dark fade so it reads on the bright Moon */}
          <motion.div style={{ opacity: lineOpacity }} className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-[linear-gradient(to_top,rgb(7_9_13/0.92),rgb(7_9_13/0.55)_45%,transparent)]" aria-hidden />
          <motion.p
            style={{ opacity: lineOpacity, y: lineY }}
            className="pointer-events-none absolute inset-x-0 bottom-10 px-6 text-center text-[clamp(22px,2.6vw,34px)] font-normal tracking-[-0.035em] text-[var(--cream)] sm:bottom-14"
          >
            As the Sun moves, the light on every crater changes.<br className="hidden sm:block" /> Lunalit tells you where it lasts.
          </motion.p>
        </div>
      </div>
    </section>
  )
}

function Word({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.16, 1])
  return <motion.span style={{ opacity }}>{children} </motion.span>
}

function Statement() {
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] })
  const text = 'At the Moon’s south pole the Sun never climbs more than a few degrees. One ridge on the horizon decides whether a lander has power, and a few days’ delay can decide whether it survives.'
  const words = text.split(' ')
  return (
    <section className="mx-auto max-w-[1100px] px-5 py-[18vh] sm:px-8">
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
    <section className="relative mx-auto max-w-[760px] px-5 pb-[16vh] sm:px-8" aria-label="Without and with Lunalit">
      <div className="sticky top-24 sm:top-28">
        <div className="card p-7 sm:p-10">
          <p className="small text-[var(--ink-2)]">Without Lunalit</p>
          <h3 className="h3 mt-3 max-w-[18ch]">Hours across three NASA tools.</h3>
          <ul className="mt-16 flex flex-col gap-3.5 sm:mt-24">
            {WITHOUT.map((t) => (
              <li key={t} className="flex items-center gap-3 text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink-2)]"><Check />{t}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="sticky top-32 mt-[40vh] sm:top-36">
        <div className="relative overflow-hidden rounded-[32px] bg-[var(--ink)] p-7 text-[var(--cream)] shadow-[0_40px_90px_-40px_rgb(34_31_28/0.8)] sm:p-10" style={{ ['--five-ink' as string]: '#fbf8f1' }}>
          <p className="small text-[#fffdf6]/60">With Lunalit</p>
          <h3 className="h3 mt-3 max-w-[18ch]">A verdict in seconds.</h3>
          <div className="absolute right-6 top-6 sm:right-10 sm:top-9"><Five size={64} mode="idle" title="Five" /></div>
          <ul className="mt-16 flex flex-col gap-3.5 sm:mt-24">
            {WITH.map((t) => (
              <li key={t} className="flex items-center gap-3 text-[15px] font-semibold tracking-[-0.02em] text-[var(--cream)]"><Check dark />{t}</li>
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
    <section id="how" className="mx-auto max-w-[1240px] scroll-mt-28 px-5 py-[14vh] sm:px-8">
      <div ref={ref} className="flex flex-wrap items-end justify-between gap-8">
        <Reveal>
          <p className="small text-[var(--ink-2)]">How it works</p>
          <h2 className="h2 mt-3 max-w-[16ch]">From a date to a decision in three steps.</h2>
        </Reveal>
        <div className="hidden sm:block">{inView && <Five size={112} draw mode="idle" title="Five drawing itself" />}</div>
      </div>
      <ol className="mt-14 grid gap-3 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.n}><Reveal delay={i * 0.1} className="h-full">
            <div className="card flex h-full flex-col p-7">
              <div className="flex items-center justify-between">
                <span className="chip">Step</span>
                <span className="tabular text-[15px] font-semibold text-[var(--ink-2)]">{s.n}</span>
              </div>
              <h3 className="mt-14 text-[24px] font-[450] leading-[1.15] tracking-[-0.035em]">{s.title}</h3>
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
    <section id="features" className="mx-auto max-w-[1240px] scroll-mt-28 px-5 pb-[10vh] sm:px-8">
      <Reveal>
        <p className="small text-[var(--ink-2)]">Features</p>
        <h2 className="h2 mt-3 max-w-[20ch]">What a landing team asks, answered on one screen.</h2>
      </Reveal>
      <div className="mt-14 flex flex-col gap-4">
        {FEATURES.map((f, i) => (
          <div key={f.tag} className="lg:sticky" style={{ top: 96 + i * 22 }}>
            <article className="card grid gap-6 p-3 lg:grid-cols-[0.82fr_1.18fr] lg:p-3">
              <div className="flex flex-col p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="chip"><span className="h-1.5 w-1.5 rounded-full bg-[var(--sun)]" aria-hidden />{f.tag}</span>
                  <span className="tabular text-[15px] font-semibold text-[var(--ink-2)]">0{i + 1}</span>
                </div>
                <h3 className="h3 mt-8 lg:mt-12">{f.title}</h3>
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

function Validation() {
  return (
    <section id="validation" className="scroll-mt-24 px-2 py-[8vh] sm:px-3">
      <div className="relative overflow-hidden rounded-[28px] bg-[var(--space)] px-5 py-[12vh] text-[var(--cream)] sm:rounded-[36px] sm:px-10 lg:px-14">
        <div className="pointer-events-none absolute -right-[18%] -top-[30%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_35%_35%,rgb(210_80_42/0.28),transparent_60%)]" aria-hidden />
        <div className="relative mx-auto max-w-[1180px]">
          <Reveal>
            <p className="small text-[#fffdf6]/60">Validated against NASA</p>
            <h2 className="h2 mt-3 max-w-[22ch]">We checked our math against JPL’s own.</h2>
          </Reveal>
          <div className="mt-16 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-end">
            <Reveal>
              <p className="tabular text-[clamp(72px,12vw,168px)] font-normal leading-[0.9] tracking-[-0.06em]">0.0005°</p>
              <p className="mt-5 max-w-[42ch] text-[16px] font-medium leading-[1.55] tracking-[-0.012em] text-[#fffdf6]/70">
                The largest difference between Lunalit’s Sun and Earth positions and an independent calculation from JPL’s DE421 ephemeris. That is a thousand times smaller than the Sun’s disc.
              </p>
            </Reveal>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['170,874', 'Sun and Earth positions checked, at all 9 sites'],
                ['0', 'sunlit or in-view calls changed by the check'],
                ['2 h', 'time step, every day from Nov 2026 to Dec 2028'],
                ['2 methods', 'used to build the terrain horizon, compared site by site'],
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
          <p className="small text-[var(--ink-2)]">Nine sites</p>
          <h2 className="h2 mt-3 max-w-[20ch]">From the sunniest ridge to a place Earth never rises.</h2>
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

function MeetFive() {
  const [mode, setMode] = useState<FiveMode>('idle')
  const [line, setLine] = useState(0)
  const speakTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(speakTimer.current), [])
  const speak = () => {
    setLine((l) => (l + 1) % FIVE_LINES.length)
    setMode('speak')
    window.clearTimeout(speakTimer.current)
    speakTimer.current = window.setTimeout(() => setMode('idle'), 2600)
  }
  return (
    <section id="five" className="mx-auto max-w-[1240px] scroll-mt-28 px-5 py-[10vh] sm:px-8">
      <div className="grid items-center gap-4 lg:grid-cols-2">
        <Reveal>
          <button
            type="button"
            onPointerEnter={() => mode !== 'speak' && setMode('listen')}
            onPointerLeave={() => mode !== 'speak' && setMode('idle')}
            onClick={speak}
            className="relative grid aspect-square w-full place-items-center rounded-[32px] bg-[#efe9dc] shadow-[0_0_0_1px_var(--line)]"
            aria-label="Talk to Five"
          >
            <Five size={260} mode={mode} title="Five" />
            <span className="absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[13px] font-semibold tracking-[-0.01em] text-[var(--ink-2)]">Hover to get his attention. Click to hear a fact.</span>
          </button>
        </Reveal>
        <div className="p-2 sm:p-6 lg:pl-12">
          <Reveal>
            <p className="small text-[var(--ink-2)]">Meet Five</p>
            <h2 className="h2 mt-3">Our guide to the Moon’s light.</h2>
            <p className="body mt-6 max-w-[46ch]">
              Our team is Lagrange Point, and Five is named after L5: a point where a small body can ride along with two big ones, always at the tip of an equilateral triangle. The triangle is Five. The dot is the Sun.
            </p>
          </Reveal>
          <motion.div
            key={line}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="mt-8 max-w-[44ch] rounded-[22px] rounded-bl-[6px] bg-[var(--ink)] px-5 py-4 text-[15px] font-semibold leading-snug tracking-[-0.02em] text-[var(--cream)]"
            aria-live="polite"
          >
            {FIVE_LINES[line]}
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function Team() {
  return (
    <section className="mx-auto max-w-[1240px] px-5 py-[8vh] sm:px-8" aria-label="Team">
      <Reveal>
        <p className="small text-[var(--ink-2)]">The team</p>
        <h2 className="h2 mt-3 max-w-[20ch]">Built by Lagrange Point.</h2>
        <p className="body mt-4 max-w-[48ch]">Six students from Iligan City, Philippines, for the 2026 NASA Space Apps Challenge.</p>
      </Reveal>
      <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {TEAM.map((n, i) => (
          <li key={n}><Reveal delay={i * 0.05}>
            <div className="card flex flex-col items-start gap-6 p-5">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--card-2)] text-[17px] font-semibold tracking-[-0.03em]" aria-hidden>{n[0]}</span>
              <span className="text-[17px] font-semibold tracking-[-0.03em]">{n}</span>
            </div>
          </Reveal></li>
        ))}
      </ul>
    </section>
  )
}

function FinalCta({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="px-2 pb-2 pt-[6vh] sm:px-3 sm:pb-3">
      <div className="relative overflow-hidden rounded-[28px] bg-[#efe9dc] px-5 py-[14vh] text-center sm:rounded-[36px]">
        <Reveal>
          <div className="mx-auto mb-8 w-fit"><Five size={84} mode="idle" title="Five" /></div>
          <h2 className="display mx-auto max-w-[14ch] text-[clamp(44px,7vw,96px)]">Plan a landing in 30 seconds.</h2>
          <p className="body mx-auto mt-5 max-w-[40ch]">Pick a site and a date. Lunalit does the rest.</p>
          <div className="mt-10 flex justify-center"><OpenButton onOpen={onOpen} /></div>
        </Reveal>
      </div>
      <footer className="mx-auto flex max-w-[1240px] flex-col gap-3 px-3 pb-6 pt-8 text-[13px] font-semibold tracking-[-0.01em] text-[var(--ink-2)] sm:flex-row sm:items-start sm:justify-between">
        <p>Lunalit by Lagrange Point · NASA Space Apps Challenge 2026, Iligan</p>
        <p className="max-w-[60ch] sm:text-right">
          A student project, not an official NASA product. Data: JPL Horizons, LRO LOLA via NASA Goddard PGDA, NASA SVS CGI Moon Kit.
        </p>
      </footer>
    </section>
  )
}

export default function Landing({ onOpenDashboard }: { onOpenDashboard: () => void }) {
  const reduce = !!useReducedMotion()
  useSmoothScroll(reduce)
  useEffect(() => {
    const prev = document.title
    document.title = 'Lunalit · Find where the Moon stays lit'
    const html = document.documentElement
    const bg = html.style.backgroundColor
    html.style.backgroundColor = '#f4efe4'
    return () => { document.title = prev; html.style.backgroundColor = bg }
  }, [])
  return (
    <div className="lnd min-h-screen">
      <Nav onOpen={onOpenDashboard} />
      <main>
        <Hero onOpen={onOpenDashboard} reduce={reduce} />
        <Statement />
        <BeforeAfter />
        <HowItWorks />
        <Features />
        <Validation />
        <Sites />
        <MeetFive />
        <Team />
        <FinalCta onOpen={onOpenDashboard} />
      </main>
    </div>
  )
}
