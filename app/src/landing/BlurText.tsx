import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { Fragment } from 'react'

/**
 * A heading that starts out of focus and sharpens word by word, left to right, the first time it
 * scrolls into view. Plain text for screen readers; no effect with reduced motion.
 */
const TAGS = { h1: motion.h1, h2: motion.h2, h3: motion.h3, p: motion.p }
const EASE = [0.23, 1, 0.32, 1] as const

const word: Variants = {
  hide: { opacity: 0, filter: 'blur(12px)', y: '0.22em' },
  show: { opacity: 1, filter: 'blur(0px)', y: 0, transition: { duration: 0.9, ease: EASE } },
}

export default function BlurText({ text, as = 'h2', className, delay = 0, stagger = 0.05, onLoad = false }: {
  text: string
  as?: keyof typeof TAGS
  className?: string
  delay?: number
  stagger?: number
  /** Animate on mount instead of on scroll (for the hero). */
  onLoad?: boolean
}) {
  const reduce = useReducedMotion()
  const Tag = TAGS[as]
  const words = text.split(' ')
  const parent: Variants = { hide: {}, show: { transition: { staggerChildren: stagger, delayChildren: delay } } }
  const trigger = onLoad
    ? { animate: 'show' as const }
    : { whileInView: 'show' as const, viewport: { once: true, margin: '0px 0px -12% 0px' } }
  return (
    <Tag className={className} variants={parent} initial={reduce ? false : 'hide'} {...trigger}>
      {words.map((w, i) => (
        <Fragment key={i}>
          <motion.span className="inline-block" variants={word}>{w}</motion.span>
          {i < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </Tag>
  )
}
