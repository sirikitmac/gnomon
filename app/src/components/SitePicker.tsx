import { motion } from 'framer-motion'
import type { Site } from '../lib/types'

const roleColor: Record<string, string> = {
  Power: 'text-sun bg-sun/10',
  Comms: 'text-earth bg-earth/10',
  'Science trade-off': 'text-risk bg-risk/10',
  'Real mission': 'text-both bg-both/10',
  Contrast: 'text-ink-2 bg-surface-2',
}

export default function SitePicker({ sites, value, onChange }: { sites: Site[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {sites.map((s) => {
        const active = s.id === value
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className={`relative rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ease-out active:scale-[0.98] ${active ? '' : 'hover:bg-surface-2'}`}
          >
            {active && (
              <motion.span
                layoutId="site-active"
                className="absolute inset-0 rounded-xl border border-line-strong bg-surface-2"
                transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
              />
            )}
            <span className="relative flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{s.name}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${roleColor[s.role] ?? 'text-ink-2'}`}>{s.role}</span>
            </span>
            <span className="relative mt-0.5 block text-xs text-ink-3 tabular">
              {Math.abs(s.lat).toFixed(1)}°{s.lat < 0 ? 'S' : 'N'} · {Math.abs(s.lonEast).toFixed(1)}°{s.lonEast < 0 ? 'W' : 'E'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
