import { motion, useReducedMotion, type Transition } from 'framer-motion'

/**
 * Five, the Lagrange Point mascot, redrawn as SVG from the team's GIFs so it stays crisp on any
 * background. The triangle is the L5 equilateral triangle; the dot is the Sun.
 *
 * mode: "idle" (the dot breathes), "speak" (the dot pulses with voice energy), "listen" (Five tilts
 * and rings ripple out), "think" (gentle contemplative tilt while a reply is generated).
 * `draw` plays the sides drawing themselves in first, like the intro video.
 */
export type FiveMode = 'idle' | 'speak' | 'listen' | 'think'

const INK = 'var(--five-ink, #221F1C)'
const SUN = 'var(--five-sun, #D2502A)'

// Geometry measured from the 512 px source art.
const A = { x: 256, y: 123 }
const B = { x: 394, y: 373 }
const C = { x: 118, y: 373 }
const DOT = { x: 256, y: 292, r: 27 }

export default function Five({ mode = 'idle', draw = false, energy, size = 120, title = 'Five, the Lagrange Point mascot', className }: {
  mode?: FiveMode
  draw?: boolean
  /** Optional normalized audio energy [0..1] for live voice amplitude reactivity. */
  energy?: number
  size?: number
  title?: string
  className?: string
}) {
  const reduce = useReducedMotion()
  const animateDraw = draw && !reduce
  const side = (i: number): Transition => ({ duration: 0.38, delay: 0.12 + i * 0.32, ease: [0.65, 0, 0.35, 1] })
  const after = animateDraw ? 1.2 : 0
  const liveEnergy = typeof energy === 'number' && energy > 0 ? Math.min(1, Math.max(0, energy)) : 0

  const dotAnim = reduce
    ? { scale: 1 }
    : mode === 'speak'
      ? (liveEnergy > 0
        ? { scale: 0.96 + liveEnergy * 0.42 }
        : { scale: [1, 1.28, 0.86, 1.18, 0.92, 1.24, 1] })
      : mode === 'think'
        ? { scale: [0.9, 1.12, 0.9] }
        : mode === 'listen'
          ? { scale: 1.04 + liveEnergy * 0.28 }
          : { scale: [1, 0.86, 1] }
  const dotTransition: Transition = reduce
    ? { duration: 0 }
    : mode === 'speak'
      ? (liveEnergy > 0
        ? { type: 'spring', stiffness: 420, damping: 22 }
        : { duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: after })
      : mode === 'think'
        ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: after }
        : mode === 'listen'
          ? { type: 'spring', stiffness: 260, damping: 18 }
          : { duration: 2.9, repeat: Infinity, ease: 'easeInOut', delay: after }

  return (
    <svg viewBox="70 70 372 362" width={size} height={size * (362 / 372)} role="img" aria-label={title} className={className}>
      <motion.g
        style={{ transformBox: 'fill-box', transformOrigin: '50% 60%' }}
        animate={
          reduce
            ? { rotate: 0, y: 0 }
            : mode === 'listen'
              ? { rotate: -11, y: 0 }
              : mode === 'think'
                ? { rotate: [-4, 4, -4], y: [0, -2, 0] }
                : mode === 'speak'
                  ? { rotate: 0, y: liveEnergy > 0 ? -liveEnergy * 6 : [0, -4, 0] }
                  : { rotate: 0, y: 0 }
        }
        transition={
          mode === 'think'
            ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
            : mode === 'speak'
              ? (liveEnergy > 0
                ? { type: 'spring', stiffness: 320, damping: 20 }
                : { duration: 0.9, repeat: Infinity, ease: 'easeInOut' })
              : { type: 'spring', stiffness: 200, damping: 16 }
        }
      >
        {/* sides: top-right, base, left — drawn in that order, like the "thinking" GIF */}
        {[[A, B], [B, C], [C, A]].map(([p, q], i) => (
          <motion.line
            key={i}
            x1={p.x} y1={p.y} x2={q.x} y2={q.y}
            stroke={INK} strokeWidth={22} strokeLinecap="square"
            initial={animateDraw ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={side(i)}
          />
        ))}
        {/* small ticks: the top one and the two "feet" */}
        <motion.g initial={animateDraw ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: animateDraw ? 0.05 : 0 }}>
          <rect x={251} y={86} width={11} height={25} fill={INK} />
          <rect x={85} y={400} width={48} height={11} fill={INK} />
          <rect x={379} y={400} width={48} height={11} fill={INK} />
        </motion.g>

        {/* listening ripples */}
        {mode === 'listen' && !reduce && [0, 0.5].map((d) => (
          <motion.circle
            key={d}
            cx={DOT.x} cy={DOT.y} r={DOT.r}
            fill="none" stroke={SUN} strokeWidth={7}
            initial={{ scale: 1, opacity: 0.55 }}
            animate={{ scale: 2.8, opacity: 0 }}
            transition={{ duration: 1.4, delay: d, repeat: Infinity, ease: 'easeOut' }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        ))}

        {/* the Sun */}
        <motion.circle
          cx={DOT.x} cy={DOT.y} r={DOT.r} fill={SUN}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          initial={animateDraw ? { scale: 0, opacity: 0.4 } : false}
          animate={{ opacity: 1, ...dotAnim }}
          transition={animateDraw ? { opacity: { duration: 0.3, delay: 1.05 }, scale: dotTransition } : dotTransition}
        />
      </motion.g>
    </svg>
  )
}
