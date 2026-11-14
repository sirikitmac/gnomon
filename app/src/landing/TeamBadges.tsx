import { motion, useInView, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { useEffect, useRef } from 'react'
import GnomonMark from '../components/GnomonMark'

/**
 * Team Lagrange Point as hanging ID badges on lanyards. Each badge drops in on its strap the first
 * time the row scrolls into view, swings when the pointer brushes past, and can be grabbed and
 * swung; it settles back like a pendulum. Photo-less members get an empty photo slot.
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

function Badge({ m, i }: { m: Member; i: number }) {
  const reduce = useReducedMotion()
  const rot = useSpring(0, { stiffness: 90, damping: 7, mass: 1.1 })
  const shadowX = useTransform(rot, (r) => `${-r * 0.5}px`)
  const pivot = useRef<HTMLDivElement>(null)
  // Watch an untransformed wrapper: the dropping element starts far above its slot, and inside the
  // overflow-hidden team section the top-row badges would be clipped out and never count as in view.
  const anchor = useRef<HTMLDivElement>(null)
  const inView = useInView(anchor, { once: true, margin: '0px 0px -10% 0px' })
  const dragging = useRef(false)
  const settle = useRef<number | undefined>(undefined)
  const strap = STRAPS[i % STRAPS.length]
  const strapMobile = MOBILE_STRAPS[i % MOBILE_STRAPS.length]
  const id = `LP-0${i + 1}`

  useEffect(() => () => window.clearTimeout(settle.current), [])

  const angleTo = (e: React.PointerEvent) => {
    const p = pivot.current?.getBoundingClientRect()
    if (!p) return 0
    const a = (Math.atan2(e.clientX - (p.left + p.width / 2), e.clientY - p.top) * 180) / Math.PI
    return Math.max(-55, Math.min(55, -a))
  }
  // Keep a held badge above its neighbours, and let it settle before dropping back.
  const lift = (e: React.PointerEvent, up: boolean) => {
    const item = e.currentTarget.closest<HTMLElement>('[role="listitem"]')
    if (!item) return
    window.clearTimeout(Number(item.dataset.t))
    if (up) item.style.zIndex = '20'
    else item.dataset.t = String(window.setTimeout(() => { item.style.zIndex = '' }, 900))
  }
  const nudge = (deg: number) => {
    if (reduce) return
    rot.set(deg)
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => { if (!dragging.current) rot.set(0) }, 110)
  }

  return (
    <div ref={anchor} className="flex shrink-0 snap-center justify-center">
    <motion.div
      initial={reduce ? false : { y: -(strap + 300) }}
      animate={inView ? { y: 0 } : undefined}
      transition={{ type: 'spring', stiffness: 70, damping: 11, mass: 1, delay: 0.1 + i * 0.09 }}
      onAnimationComplete={() => nudge(i % 2 ? -7 : 7)}
    >
      <motion.div ref={pivot} style={{ rotate: reduce ? 0 : rot, transformOrigin: '50% 0%' }} className="lnd-pivot flex flex-col items-center">
        {/* strap: height comes from --strap (desktop) / --strap-m (phone grid) in landing.css */}
        <div
          className="lnd-strap flex w-[26px] justify-center overflow-hidden"
          style={{ ['--strap' as string]: `${strap}px`, ['--strap-m' as string]: `${strapMobile}px` }}
          aria-hidden
        >
          <span className="lnd-strap-text">Lagrange Point · Lagrange Point · Lagrange Point · Lagrange Point</span>
        </div>
        <Clip />
        {/* card */}
        <motion.article
          style={{ ['--sx' as string]: shadowX }}
          onPointerDown={(e) => { if (reduce) return; dragging.current = true; lift(e, true); e.currentTarget.setPointerCapture(e.pointerId); rot.set(angleTo(e)) }}
          onPointerMove={(e) => {
            if (reduce) return
            if (dragging.current) rot.set(angleTo(e))
            else if (e.pointerType === 'mouse') nudge(Math.max(-14, Math.min(14, e.movementX * 1.4)))
          }}
          onPointerUp={(e) => { dragging.current = false; lift(e, false); rot.set(0) }}
          onPointerCancel={(e) => { dragging.current = false; lift(e, false); rot.set(0) }}
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
        </motion.article>
      </motion.div>
    </motion.div>
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
