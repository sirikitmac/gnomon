import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/dom'
import { LEARN_STEPS } from '../lib/learn'

interface Rect { top: number; left: number; width: number; height: number }
const PAD = 6
const BAR = 64 // sticky app bar + a little air

function scrollToTarget(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const r = el.getBoundingClientRect()
  // Already fully visible below the app bar (e.g. the sticky sidebar)? Don't move the page.
  if (r.top >= BAR && r.bottom <= innerHeight - 180) return
  window.scrollTo({ top: Math.max(0, r.top + scrollY - BAR - 8), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

/**
 * Guided walkthrough. Dims the page, spotlights one part of the UI per step and explains it.
 * Keyboard: ←/→ (or Enter on Next) to move, Esc to exit; focus stays in the card and returns
 * to the Learn button when the tour ends.
 */
export default function LearnTour({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate?: (target: string) => void }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const s = LEARN_STEPS[step]
  const last = step === LEARN_STEPS.length - 1

  // Reset to the first step each time the tour opens.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) { setWasOpen(open); if (open) setStep(0) }

  useEffect(() => {
    if (!open) return
    // The target may live on another page: switch to it, then scroll once it has rendered.
    onNavigate?.(s.target)
    let r2 = 0
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => scrollToTarget(s.target)) })
    card.current?.focus()
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2) }
  }, [open, s.target, onNavigate])

  // Follow the target while the page scrolls or resizes.
  useEffect(() => {
    if (!open) return
    let raf = 0
    let prev = ''
    const loop = () => {
      const el = document.getElementById(s.target)
      if (el) {
        const r = el.getBoundingClientRect()
        const key = `${r.top}|${r.left}|${r.width}|${r.height}`
        if (key !== prev) { prev = key; setRect({ top: r.top, left: r.left, width: r.width, height: r.height }) }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [open, s.target])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.closest('input, textarea, select') && !card.current?.contains(t)
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (typing) return
      if (e.key === 'ArrowRight' || (e.key === 'Enter' && t === card.current)) {
        e.preventDefault()
        if (last) onClose(); else setStep((i) => i + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setStep((i) => Math.max(0, i - 1))
      } else if (e.key === 'Tab' && card.current) {
        // Keep keyboard focus inside the card while the tour is open.
        const items = Array.from(card.current.querySelectorAll<HTMLElement>('button'))
        if (!items.length) return
        const i = items.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); items[items.length - 1].focus() }
        else if (!e.shiftKey && (i === -1 || i === items.length - 1)) { e.preventDefault(); items[0].focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, last, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="learn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {/* Spotlight: a hole in a dimmed page. Clicks go through to the page. */}
          {rect && (
            <div
              aria-hidden
              className="pointer-events-none fixed z-[70] rounded-[16px] ring-2 ring-accent motion-safe:transition-[top,left,width,height] motion-safe:duration-300 motion-safe:ease-out"
              style={{
                top: rect.top - PAD, left: rect.left - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
              }}
            />
          )}
          <div
            ref={card}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="learn-title"
            aria-describedby="learn-body"
            className="fixed inset-x-4 bottom-4 z-[71] mx-auto max-w-[440px] rounded-[16px] border border-line bg-surface/95 p-5 shadow-pop outline-none backdrop-blur-2xl backdrop-saturate-150 sm:bottom-6"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-accent">Learn · {step + 1} of {LEARN_STEPS.length}</span>
              <button onClick={onClose} aria-label="Exit Learn mode" className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M3 3l10 10M13 3L3 13" /></svg>
              </button>
            </div>
            {/* New text swaps in at once (screen readers get it immediately) and only fades in. */}
            <motion.div key={step} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
              <h2 id="learn-title" className="mt-1 font-display text-lg font-semibold">{s.title}</h2>
              <p id="learn-body" className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.body}</p>
            </motion.div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex gap-1.5" aria-hidden>
                {LEARN_STEPS.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${i === step ? 'w-4 bg-accent' : 'w-1.5 bg-line-strong'}`} />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep((i) => Math.max(0, i - 1))}
                  disabled={step === 0}
                  className="min-h-9 rounded-[8px] px-3 text-[13px] font-medium text-ink-2 shadow-control transition-colors hover:text-ink disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  onClick={() => (last ? onClose() : setStep((i) => i + 1))}
                  className="min-h-9 rounded-[8px] bg-accent px-4 text-[13px] font-medium text-on-accent shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_0.5px_0_rgba(255,255,255,0.25)] transition-[filter,transform] hover:brightness-105 active:scale-[0.97]"
                >
                  {last ? 'Done' : 'Next'}
                </button>
              </div>
            </div>
            <p className="mt-3 hidden text-[11px] text-ink-3 sm:block">← → to move · Esc to exit</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
