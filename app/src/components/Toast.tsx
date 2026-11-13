import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'

/** Small confirmation pill at the bottom of the screen. Announced to screen readers. */
export default function Toast({ message, onDone }: { message: { id: number; text: string } | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
  }, [message, onDone])
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      <AnimatePresence>
        {message && (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="flex items-center gap-2 rounded-full border border-line bg-surface/95 px-4 py-2 text-[13px] font-medium shadow-pop backdrop-blur-xl"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--both)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3.5 8.5l3 3 6-7" /></svg>
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
