import { motion } from 'framer-motion'
import type { Site } from '../lib/types'

const roleDot: Record<string, string> = {
  Power: 'bg-sun',
  Comms: 'bg-earth',
  'Science trade-off': 'bg-risk',
  'Real mission': 'bg-both',
  Contrast: 'bg-ink-3',
}

export default function SitePicker({ sites, value, onChange }: { sites: Site[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="-mx-1 flex flex-col gap-0.5">
      {sites.map((s) => {
        const active = s.id === value
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            aria-pressed={active}
            className={`relative rounded-[9px] px-3 py-2 text-left transition-colors duration-150 ease-out active:scale-[0.985] ${active ? 'text-white' : 'hover:bg-surface-2'}`}
          >
            {active && (
              <motion.span
                layoutId="site-active"
                className="absolute inset-0 rounded-[9px] bg-accent shadow-control"
                transition={{ type: 'spring', duration: 0.3, bounce: 0.08 }}
              />
            )}
            <span className="relative flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-medium">{s.name}</span>
              <span className={`flex shrink-0 items-center gap-1.5 text-[11px] ${active ? 'text-white/80' : 'text-ink-3'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : roleDot[s.role] ?? 'bg-ink-3'}`} />
                {s.role}
              </span>
            </span>
            <span className={`relative mt-0.5 block text-[11px] tabular ${active ? 'text-white/70' : 'text-ink-3'}`}>
              {Math.abs(s.lat).toFixed(1)}°{s.lat < 0 ? 'S' : 'N'} · {Math.abs(s.lonEast).toFixed(1)}°{s.lonEast < 0 ? 'W' : 'E'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
