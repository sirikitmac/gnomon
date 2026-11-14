import { motion } from 'framer-motion'
import { VIEWS, type View } from '../lib/views'

/** Page switcher in the app bar: a segmented control. */
export default function ViewTabs({ value, onChange, className = '' }: { value: View; onChange: (v: View) => void; className?: string }) {
  return (
    <nav aria-label="Pages" className={className}>
      <div className="flex gap-0.5 rounded-full bg-surface-2 p-[2px]" role="tablist">
        {VIEWS.map((v) => {
          const active = v.id === value
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={v.hint}
              onClick={() => onChange(v.id)}
              className={`relative min-h-8 flex-1 rounded-full px-3 text-[13px] transition-colors duration-150 ${active ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}
            >
              {active && (
                <motion.span
                  layoutId="view-tab"
                  className="absolute inset-0 rounded-full bg-surface shadow-control"
                  transition={{ type: 'spring', duration: 0.3, bounce: 0.08 }}
                />
              )}
              <span className="relative">{v.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
