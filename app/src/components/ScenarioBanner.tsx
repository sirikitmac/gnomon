import { AnimatePresence, motion } from 'framer-motion'

/** Dismissible explanation shown after a Scenarios preset is applied. */
export default function ScenarioBanner({ scenario, onClose }: { scenario: { title: string; explain: string } | null; onClose: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {scenario && (
        <motion.section
          key={scenario.title}
          role="status"
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="flex items-start gap-3 rounded-[14px] border border-accent/25 bg-accent/[0.07] p-4 shadow-card"
        >
          <svg className="mt-0.5 shrink-0 text-accent" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><circle cx="9" cy="9" r="7" /><path d="M9 8v4.5M9 5.6v.1" /></svg>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-accent">Scenario</div>
            <h2 className="font-display text-[15px] font-semibold">{scenario.title}</h2>
            <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-ink-2">{scenario.explain}</p>
          </div>
          <button onClick={onClose} aria-label="Dismiss scenario" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 3l10 10M13 3L3 13" /></svg>
          </button>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
