import { motion } from 'framer-motion'
import { isOriginal } from '../lib/compare'
import type { Site } from '../lib/types'

export default function SitePicker({ sites, value, onChange }: { sites: Site[]; value: string; onChange: (id: string) => void }) {
  const original = sites.filter(isOriginal)
  const more = sites.filter((s) => !isOriginal(s))
  return (
    <div className="-mx-1 flex flex-col gap-0.5">
      <SiteList sites={original} value={value} onChange={onChange} />
      {more.length > 0 && (
        <>
          <div className="mt-2 px-3 pb-1 text-[11px] font-medium text-ink-3">More sites</div>
          <SiteList sites={more} value={value} onChange={onChange} />
        </>
      )}
    </div>
  )
}

function SiteList({ sites, value, onChange }: { sites: Site[]; value: string; onChange: (id: string) => void }) {
  return (
    <>
      {sites.map((s) => {
        const active = s.id === value
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            aria-pressed={active}
            className={`relative rounded-[12px] px-3 py-2 text-left transition-colors duration-150 ease-out active:scale-[0.985] ${active ? 'text-on-accent' : 'hover:bg-surface-2'}`}
          >
            {active && (
              <motion.span
                layoutId="site-active"
                className="absolute inset-0 rounded-[12px] bg-accent shadow-control"
                transition={{ type: 'spring', duration: 0.3, bounce: 0.08 }}
              />
            )}
            <span className="relative flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-medium">{s.name}</span>
            </span>
            <span className={`relative mt-0.5 block text-[11px] tabular ${active ? 'text-on-accent/70' : 'text-ink-3'}`}>
              {Math.abs(s.lat).toFixed(1)}°{s.lat < 0 ? 'S' : 'N'} · {Math.abs(s.lonEast).toFixed(1)}°{s.lonEast < 0 ? 'W' : 'E'}
            </span>
          </button>
        )
      })}
    </>
  )
}
