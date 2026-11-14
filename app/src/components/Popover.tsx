import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useId, useRef, useState } from 'react'

const EASE = [0.23, 1, 0.32, 1] as const

/**
 * App-bar dropdown: a trigger button and a glass panel of menu items.
 * Esc or a click outside closes it and returns focus to the trigger; ↑/↓ move between items.
 */
export default function Popover({ label, icon, title, width = 340, children }: {
  label: string
  icon: React.ReactNode
  title?: string
  width?: number
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const items = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])
    requestAnimationFrame(() => items()[0]?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const list = items()
      const i = list.indexOf(document.activeElement as HTMLElement)
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
  }, [open])

  const close = () => { setOpen(false); document.getElementById(id + '-trigger')?.focus() }

  return (
    <div className="relative">
      <button
        ref={trigger}
        id={id + '-trigger'}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        title={title}
        className={`flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-[0.96] sm:px-2.5 ${open ? 'bg-surface-2 text-ink' : ''}`}
      >
        {icon}
        <span className="hidden md:inline">{label}</span>
        <span className="sr-only md:hidden">{label}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panel}
            id={id}
            role="menu"
            aria-label={label}
            initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
            style={{ width: `min(${width}px, calc(100vw - 32px))` }}
            className="fixed right-4 top-[3.75rem] z-50 origin-top-right rounded-[12px] border border-line bg-surface/95 p-1.5 shadow-pop backdrop-blur-2xl backdrop-saturate-150 sm:absolute sm:right-0 sm:top-11"
          >
            {children(close)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A row inside a Popover. */
export function MenuItem({ title, detail, onSelect, disabled, icon }: { title: string; detail?: string; onSelect: () => void; disabled?: boolean; icon?: React.ReactNode }) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-start gap-3 rounded-[8px] px-3 py-2 text-left outline-none transition-colors duration-100 hover:bg-accent hover:text-on-accent focus-visible:bg-accent focus-visible:text-on-accent disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-ink [&:hover_.detail]:text-on-accent/80 [&:focus-visible_.detail]:text-on-accent/80"
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{title}</span>
        {detail && <span className="detail block text-xs text-ink-3">{detail}</span>}
      </span>
    </button>
  )
}
