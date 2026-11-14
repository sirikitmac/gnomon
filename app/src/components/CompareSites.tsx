import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { isOriginal } from '../lib/compare'
import type { Site } from '../lib/types'

const EASE = [0.23, 1, 0.32, 1] as const

/**
 * The sites on the Compare page, as removable chips, plus an "Add site" menu for the rest.
 * At least one site always stays on the list.
 */
export default function CompareSites({ sites, ids, onChange, chips = true }: { sites: Site[]; ids: string[]; onChange: (ids: string[]) => void
  /** False: just the Add site menu (and reset); sites are removed from each row's menu instead. */
  chips?: boolean }) {
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const shown = sites.filter((s) => ids.includes(s.id))
  const rest = sites.filter((s) => !ids.includes(s.id))
  const defaults = sites.filter(isOriginal).map((s) => s.id)
  const isDefault = ids.length === defaults.length && defaults.every((id) => ids.includes(id))

  useEffect(() => {
    if (!open) return
    const items = () => Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    requestAnimationFrame(() => items()[0]?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const list = items()
      const i = list.indexOf(document.activeElement as HTMLElement)
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
    }
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
  }, [open])

  // Keep the dataset's order so chips don't jump around as sites come and go.
  const add = (id: string) => onChange(sites.map((s) => s.id).filter((x) => x === id || ids.includes(x)))
  const remove = (id: string) => { if (ids.length > 1) onChange(ids.filter((x) => x !== id)) }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${chips ? 'mb-4' : ''}`} aria-label="Sites being compared">
      {chips && shown.map((s) => (
        <span key={s.id} className="flex h-8 items-center gap-1 rounded-full bg-surface-2 pl-3 pr-1 text-[13px]">
          <span className="max-w-[16rem] truncate">{s.name}</span>
          <button
            type="button"
            onClick={() => remove(s.id)}
            disabled={ids.length <= 1}
            aria-label={`Remove ${s.name} from the comparison`}
            title={ids.length <= 1 ? 'Keep at least one site' : 'Remove from the comparison'}
            className="relative grid h-6 w-6 place-items-center rounded-full text-ink-3 transition-colors duration-150 before:absolute before:-inset-2 before:content-[''] hover:bg-ink/10 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M2 2l6 6M8 2L2 8" /></svg>
          </button>
        </span>
      ))}

      <div ref={wrap} className="relative">
        <button
          ref={trigger}
          type="button"
          onClick={(e) => {
            // Open toward whichever side has room for the 320px menu.
            const r = e.currentTarget.getBoundingClientRect()
            setAlignRight(r.left + 320 > window.innerWidth - 16)
            setOpen((o) => !o)
          }}
          disabled={!rest.length}
          aria-haspopup="menu"
          aria-expanded={open}
          title={rest.length ? 'Add a site to the comparison' : 'Every site is already on the list'}
          className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-surface-2 active:scale-[0.97] disabled:text-ink-3 disabled:hover:bg-transparent"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" aria-hidden><path d="M5.5 1.5v8M1.5 5.5h8" /></svg>
          Add site
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              role="menu"
              aria-label="Add a site"
              initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: EASE }}
              className={`absolute top-10 z-40 w-[min(320px,calc(100vw-32px))] rounded-[12px] ${alignRight ? 'right-0 origin-top-right' : 'left-0 origin-top-left'} border border-line bg-surface/95 p-1.5 shadow-pop backdrop-blur-2xl backdrop-saturate-150`}
            >
              {rest.map((s) => (
                <button
                  key={s.id}
                  role="menuitem"
                  onClick={() => { add(s.id); if (rest.length === 1) { setOpen(false); trigger.current?.focus() } }}
                  className="flex w-full flex-col rounded-[8px] px-3 py-2 text-left outline-none transition-colors duration-100 hover:bg-accent hover:text-on-accent focus-visible:bg-accent focus-visible:text-on-accent [&:focus-visible_.detail]:text-on-accent/80 [&:hover_.detail]:text-on-accent/80"
                >
                  <span className="text-[13px] font-medium">{s.name}</span>
                  <span className="detail text-xs text-ink-3 tabular">
                    {s.role} · {Math.abs(s.lat).toFixed(1)}°{s.lat < 0 ? 'S' : 'N'}, {Math.abs(s.lonEast).toFixed(1)}°{s.lonEast < 0 ? 'W' : 'E'}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!isDefault && (
        <button type="button" onClick={() => onChange(defaults)} className="h-8 rounded-full px-2 text-[13px] text-ink-2 underline-offset-2 transition-colors duration-150 hover:text-ink hover:underline">
          Reset to the original {defaults.length}
        </button>
      )}
    </div>
  )
}
