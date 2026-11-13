import type { Advice, Tone } from '../lib/advice'

const toneDot: Record<Tone, string> = {
  good: 'bg-both',
  warn: 'bg-risk',
  bad: 'bg-nogo',
  info: 'bg-accent',
}
const toneLabel: Record<Tone, string> = { good: 'Good', warn: 'Caution', bad: 'Problem', info: 'Note' }

/** Plain-language notes for the current mission, each built from numbers on this page. */
export default function MissionAdvice({ items, onLanding, onSite }: { items: Advice[]; onLanding: (idx: number) => void; onSite: (id: string) => void }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map((it) => (
        <li key={it.key} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${toneDot[it.tone]}`} aria-hidden />
          <span className="sr-only">{toneLabel[it.tone]}: </span>
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-pretty">{it.text}</p>
          {it.action && (
            <button
              type="button"
              onClick={() => (it.action!.landing !== undefined ? onLanding(it.action!.landing) : it.action!.siteId && onSite(it.action!.siteId))}
              className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-surface-2 active:scale-[0.97]"
            >
              {it.action.label}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
