import { useInView, useReducedMotion } from 'framer-motion'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import GnomonMark from '../components/GnomonMark'

/**
 * Team Lagrange Point as hanging ID badges on lanyards. Each badge drops in on its strap the first
 * time the row scrolls into view and bounces on it. Grab a badge to pull it: the strap stretches,
 * bends and folds, and when you let go it springs back and swings. Photo-less members get an
 * empty photo slot.
 */
export type Member = { name: string; photo?: string; role: string }

const STRAPS = [96, 150, 112, 168, 104, 138] // strap lengths in px, varied so the row looks hung by hand
// Phone (<= 768px) 2x3 grid: shorter straps so three rows fit; the right column (odd index) always hangs ~36px lower.
const MOBILE_STRAPS = [72, 108, 48, 84, 56, 92]

/** Faint crater-contour rings behind the card face. */
function Contours() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 176 256" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="0.7">
        {Array.from({ length: 11 }, (_, i) => (
          <ellipse key={i} cx={10} cy={250} rx={26 + i * 19} ry={22 + i * 17} transform={`rotate(${-8 + i * 1.5} 10 250)`} />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <circle key={`b${i}`} cx={170} cy={18} r={10 + i * 12} />
        ))}
      </g>
    </svg>
  )
}

/** The metal swivel clip between strap and card. */
function Clip() {
  return (
    <svg width="26" height="40" viewBox="0 0 26 40" className="relative z-[1] -my-[6px]" aria-hidden>
      <defs>
        <linearGradient id="lp-metal" x1="0" x2="1">
          <stop offset="0" stopColor="#8b8f96" />
          <stop offset="0.45" stopColor="#eef0f2" />
          <stop offset="1" stopColor="#7d8188" />
        </linearGradient>
      </defs>
      <rect x="5" y="0" width="16" height="9" rx="2" fill="url(#lp-metal)" />
      <ellipse cx="13" cy="13" rx="5.5" ry="4" fill="none" stroke="url(#lp-metal)" strokeWidth="2.4" />
      <path d="M13 17v6c0 3-4 3-4 7s3 6 4 6 4-2 4-6" fill="none" stroke="url(#lp-metal)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

// Rope physics (Verlet): the strap is a chain of points that sags, folds when slack and stretches
// like elastic when the badge is pulled, then springs back. The card hangs from the last point and
// swings with it. Units are CSS px and animation frames.
const SEGS = 14
const GRAVITY = 0.55
const DAMP = 0.972
const STIFF = 0.42 // < 1 per pass keeps the strap elastic instead of rigid
const PASSES = 5
const MAX_STRETCH = 1.9
const LETTERING = Array(8).fill('Lagrange Point').join(' · ')

type Pt = { x: number; y: number; px: number; py: number }
type Sim = {
  pts: Pt[]
  L: number
  theta: number
  vtheta: number
  drag: { ox: number; oy: number; tx: number; ty: number } | null
  raf: number
  quiet: number
}

function Badge({ m, i }: { m: Member; i: number }) {
  const reduce = useReducedMotion()
  // Watch an untransformed wrapper: the badge starts above its slot, inside the overflow-hidden section.
  const anchor = useRef<HTMLDivElement>(null)
  const inView = useInView(anchor, { once: true, margin: '0px 0px -10% 0px' })
  const spacer = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const ribbon = useRef<SVGPathElement>(null)
  const edge = useRef<SVGPathElement>(null)
  const pathId = `lp-strap-${useId().replace(/:/g, '')}`
  const sim = useRef<Sim | null>(null)
  const [dropped, setDropped] = useState(false)
  const strap = STRAPS[i % STRAPS.length]
  const strapMobile = MOBILE_STRAPS[i % MOBILE_STRAPS.length]
  const id = `LP-0${i + 1}`

  const draw = () => {
    const S = sim.current
    if (!S) return
    const P = S.pts
    let d = `M${P[0].x.toFixed(1)} ${P[0].y.toFixed(1)}`
    for (let k = 1; k < P.length - 1; k++) {
      const mx = (P[k].x + P[k + 1].x) / 2, my = (P[k].y + P[k + 1].y) / 2
      d += ` Q${P[k].x.toFixed(1)} ${P[k].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
    }
    const E = P[P.length - 1]
    d += ` L${E.x.toFixed(1)} ${E.y.toFixed(1)}`
    ribbon.current?.setAttribute('d', d)
    edge.current?.setAttribute('d', d)
    if (body.current) {
      body.current.style.transform = `translate(${E.x.toFixed(2)}px, ${(E.y - S.L).toFixed(2)}px) rotate(${S.theta.toFixed(2)}deg)`
      body.current.style.setProperty('--sx', `${(-S.theta * 0.5).toFixed(1)}px`)
    }
  }

  const step = () => {
    const S = sim.current
    if (!S) return
    const P = S.pts, n = P.length, rest = S.L / (n - 1)
    let moving = 0
    for (let k = 1; k < n; k++) {
      const p = P[k]
      const vx = (p.x - p.px) * DAMP, vy = (p.y - p.py) * DAMP
      p.px = p.x; p.py = p.y
      p.x += vx; p.y += vy + GRAVITY
      moving = Math.max(moving, Math.abs(vx) + Math.abs(vy))
    }
    const E = P[n - 1]
    if (S.drag) {
      // Hold the clip where the pointer is, but never further than the strap can stretch.
      let tx = S.drag.tx, ty = S.drag.ty
      const r = Math.hypot(tx, ty), lim = S.L * MAX_STRETCH
      if (r > lim) { tx *= lim / r; ty *= lim / r }
      E.x = tx; E.y = ty
    }
    // The card is heavy, the strap light: corrections move the strap more than the card.
    const w = (k: number) => (k === 0 ? 0 : k === n - 1 ? (S.drag ? 0 : 0.18) : 1)
    for (let pass = 0; pass < PASSES; pass++) {
      for (let k = 0; k < n - 1; k++) {
        const a = P[k], b = P[k + 1]
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 1e-6
        if (dist <= rest) continue // a strap can go slack and fold, but not push
        const wa = w(k), wb = w(k + 1), ws = wa + wb
        if (!ws) continue
        const c = ((dist - rest) / dist) * STIFF
        a.x += dx * c * (wa / ws); a.y += dy * c * (wa / ws)
        b.x -= dx * c * (wb / ws); b.y -= dy * c * (wb / ws)
      }
    }
    // The card follows the last bit of strap, with a little lag so it swings past and settles.
    const prev = P[n - 3]
    const target = Math.max(-70, Math.min(70, (-Math.atan2(E.x - prev.x, E.y - prev.y) * 180) / Math.PI))
    S.vtheta = (S.vtheta + (target - S.theta) * 0.16) * 0.8
    S.theta += S.vtheta
    draw()
    S.quiet = !S.drag && moving < 0.03 && Math.abs(S.vtheta) < 0.01 ? S.quiet + 1 : 0
    if (S.quiet > 40) { S.raf = 0; return } // asleep until the next touch
    S.raf = requestAnimationFrame(step)
  }
  const wake = () => {
    const S = sim.current
    if (S && !S.raf && !reduce) { S.quiet = 0; S.raf = requestAnimationFrame(step) }
  }

  // Build the strap at rest, matching the CSS strap length (it differs on phones).
  useLayoutEffect(() => {
    const L = spacer.current?.offsetHeight || strap
    const pts = Array.from({ length: SEGS + 1 }, (_, k) => ({ x: 0, y: (L * k) / SEGS, px: 0, py: (L * k) / SEGS }))
    sim.current = { pts, L, theta: 0, vtheta: 0, drag: null, raf: 0, quiet: 0 }
    draw()
    const ro = new ResizeObserver(() => {
      const S = sim.current, h = spacer.current?.offsetHeight
      if (!S || !h || Math.abs(h - S.L) < 1) return
      S.L = h
      S.pts.forEach((p, k) => { p.x = p.px = 0; p.y = p.py = (h * k) / SEGS })
      draw()
    })
    if (spacer.current) ro.observe(spacer.current)
    return () => { ro.disconnect(); if (sim.current?.raf) cancelAnimationFrame(sim.current.raf) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // First time in view: drop the badge from above its hook; the strap catches it and bounces.
  useEffect(() => {
    if (!inView || dropped) return
    const S = sim.current
    if (!S) return
    const t = window.setTimeout(() => {
      if (!reduce) {
        const side = i % 2 ? -1 : 1
        S.pts.forEach((p, k) => {
          const f = k / SEGS
          p.x = p.px = side * 34 * f
          p.y = p.py = -S.L * 0.9 * f
        })
        S.pts[SEGS].px -= side * 3
      }
      setDropped(true)
      draw()
      wake()
    }, 100 + i * 90)
    return () => window.clearTimeout(t)
  }, [inView]) // eslint-disable-line react-hooks/exhaustive-deps

  const toLocal = (e: React.PointerEvent) => {
    const r = spacer.current!.getBoundingClientRect()
    return { x: e.clientX - (r.left + r.width / 2), y: e.clientY - r.top }
  }
  // Keep a held badge above its neighbours, and let it settle before dropping back.
  const lift = (e: React.PointerEvent, up: boolean) => {
    const item = e.currentTarget.closest<HTMLElement>('[role="listitem"]')
    if (!item) return
    window.clearTimeout(Number(item.dataset.t))
    if (up) item.style.zIndex = '20'
    else item.dataset.t = String(window.setTimeout(() => { item.style.zIndex = '' }, 1400))
  }

  return (
    <div ref={anchor} className="flex shrink-0 snap-center justify-center">
      <div className={`lnd-pivot relative flex flex-col items-center transition-opacity duration-200 ${dropped || reduce ? 'opacity-100' : 'opacity-0'}`}>
        {/* the strap is drawn as a curve through the rope points, from the hook at the top */}
        <svg className="pointer-events-none absolute left-1/2 top-0 z-0 h-px w-px overflow-visible" aria-hidden>
          <path ref={edge} className="lnd-strap-edge" fill="none" strokeWidth={26} strokeLinejoin="round" />
          <path ref={ribbon} id={pathId} className="lnd-strap-ribbon" fill="none" strokeWidth={22} strokeLinejoin="round" />
          <text className="lnd-strap-letters" dy={3.6}>
            <textPath href={`#${pathId}`} startOffset={6}>{LETTERING}</textPath>
          </text>
        </svg>
        {/* reserves the strap's length in the layout: --strap (desktop) / --strap-m (phone grid) */}
        <div
          ref={spacer}
          className="lnd-strap w-[26px]"
          style={{ ['--strap' as string]: `${strap}px`, ['--strap-m' as string]: `${strapMobile}px` }}
          aria-hidden
        />
        <div ref={body} className="relative z-[1] flex w-full flex-col items-center will-change-transform" style={{ transformOrigin: '50% 0%' }}>
          <Clip />
          <article
            onPointerDown={(e) => {
              const S = sim.current
              if (reduce || !S) return
              const E = S.pts[SEGS], q = toLocal(e)
              S.drag = { ox: q.x - E.x, oy: q.y - E.y, tx: E.x, ty: E.y }
              lift(e, true)
              e.currentTarget.setPointerCapture(e.pointerId)
              wake()
            }}
            onPointerMove={(e) => {
              const S = sim.current
              if (reduce || !S) return
              if (S.drag) {
                const q = toLocal(e)
                S.drag.tx = q.x - S.drag.ox; S.drag.ty = q.y - S.drag.oy
              } else if (e.pointerType === 'mouse') {
                // Brushing past gives the badge a small push.
                S.pts[SEGS].px -= Math.max(-6, Math.min(6, e.movementX * 0.35))
                wake()
              }
            }}
            onPointerUp={(e) => { if (sim.current) sim.current.drag = null; lift(e, false); wake() }}
            onPointerCancel={(e) => { if (sim.current) sim.current.drag = null; lift(e, false); wake() }}
            className="lnd-badge relative w-[176px] cursor-grab touch-pan-y select-none overflow-hidden rounded-[16px] p-3.5 active:cursor-grabbing"
            aria-label={`${m.name}, ${m.role}, Team Lagrange Point`}
          >
            <Contours />
            {/* slot punched for the clip */}
            <span className="lnd-slot absolute left-1/2 top-2 h-[6px] w-[30px] -translate-x-1/2 rounded-full" aria-hidden />
            <div className="relative flex items-start justify-between pt-2">
              <p className="lnd-badge-name text-[24px] font-extrabold uppercase leading-[0.92] tracking-[-0.045em]">{m.name}</p>
              <span className="mt-0.5 opacity-80"><GnomonMark height={13} /></span>
            </div>
            <p className="lnd-badge-team relative mt-1 text-[10.5px] font-bold tracking-[-0.005em]">Team Lagrange Point</p>
            <div className="lnd-photo relative ml-auto mt-2.5 aspect-[5/6] w-[118px] overflow-hidden rounded-[8px]">
              {m.photo ? (
                <img src={m.photo} alt={`Portrait of ${m.name}`} loading="lazy" decoding="async" width={500} height={600} draggable={false} className="h-full w-full object-cover" />
              ) : (
                <span className="sr-only">Photo coming soon</span>
              )}
            </div>
            <p className="lnd-badge-role relative mt-3 min-h-[2.5em] text-[11px] font-bold leading-[1.22] tracking-[-0.01em] [text-wrap:balance]">{m.role}</p>
            <div className="relative mt-2 flex items-end justify-between">
              <p className="tabular text-[9.5px] font-bold tracking-[0.01em] opacity-70">ID: {id}</p>
              <p className="text-right text-[8.5px] font-bold leading-[1.25] opacity-70">Space Apps 2026</p>
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}

export default function TeamBadges({ members }: { members: Member[] }) {
  return (
    <div
      className="lnd-team -mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-10 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-2 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
      role="list"
      aria-label="Team members"
    >
      {members.map((m, i) => (
        <div role="listitem" key={m.name} className="relative hover:z-10"><Badge m={m} i={i} /></div>
      ))}
    </div>
  )
}
