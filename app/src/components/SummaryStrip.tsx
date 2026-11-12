import { AnimatePresence, motion } from 'framer-motion'
import { fmtDate, fmtHours, idxToDate } from '../lib/engine'
import type { Analysis, Dataset, Verdict } from '../lib/types'

const vStyle: Record<Verdict, string> = {
  GO: 'bg-both text-white dark:text-bg',
  RISKY: 'bg-risk text-white dark:text-bg',
  'NO-GO': 'bg-nogo text-white dark:text-bg',
}
const vText: Record<Verdict, string> = { GO: 'text-both', RISKY: 'text-risk', 'NO-GO': 'text-nogo' }

function Delta({ v, unit = '%', invert = false }: { v: number; unit?: string; invert?: boolean }) {
  if (Math.abs(v) < 0.5) return <span className="text-ink-3">no change</span>
  const good = invert ? v < 0 : v > 0
  return <span className={good ? 'text-both' : 'text-nogo'}>{v > 0 ? '+' : '−'}{Math.round(Math.abs(v))}{unit === 'h' ? ' h' : unit}</span>
}

function Stat({ label, value, bar, color, delta }: { label: string; value: string; bar?: number; color?: string; delta?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular leading-none">{value}</div>
      {bar !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
          <motion.div className="h-full rounded-full" style={{ background: color }} initial={false} animate={{ width: `${bar}%` }} transition={{ duration: 0.4, ease: [0.645, 0.045, 0.355, 1] }} />
        </div>
      )}
      {delta && <div className="mt-1.5 text-xs tabular">{delta}</div>}
    </div>
  )
}

export default function SummaryStrip({ ds, a, slipped, slipDays, needComms }: { ds: Dataset; a: Analysis; slipped: Analysis | null; slipDays: number; needComms: boolean }) {
  const w = a.firstWindow
  const s = slipped && slipDays > 0 ? slipped : null
  return (
    <section className="grid overflow-hidden rounded-2xl border border-line bg-surface lg:grid-cols-[minmax(280px,1.3fr)_repeat(4,minmax(0,1fr))]">
      <div className="flex items-start gap-4 border-b border-line p-4 lg:border-b-0 lg:border-r">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={a.verdict}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className={`shrink-0 rounded-xl px-3.5 py-2 font-display text-xl font-semibold ${vStyle[a.verdict]}`}
          >
            {a.verdict}
          </motion.div>
        </AnimatePresence>
        <div className="min-w-0">
          <div className="text-xs text-ink-3">{needComms ? 'Power and comms' : 'Power'} window after landing</div>
          {w ? (
            <>
              <div className="mt-0.5 text-sm font-medium tabular">{fmtDate(idxToDate(ds, w.from))} to {fmtDate(idxToDate(ds, w.to))}</div>
              <div className="text-xs text-ink-2">
                {fmtHours((w.to - w.from) * ds.meta.stepHours)} without a break{w.from > a.startIdx ? `, opens ${fmtHours((w.from - a.startIdx) * ds.meta.stepHours)} after landing` : ''}
              </div>
            </>
          ) : (
            <div className="mt-0.5 text-sm text-nogo">No window in the data range</div>
          )}
          {s && (
            <div className="mt-1.5 text-xs">
              Landing {slipDays} day{slipDays > 1 ? 's' : ''} late: <span className={`font-semibold ${vText[s.verdict]}`}>{s.verdict}</span>
              {s.verdict === a.verdict && <span className="text-ink-3"> (same)</span>}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 divide-line sm:grid-cols-4 lg:col-span-4 lg:divide-x [&>*]:border-line max-sm:[&>*:nth-child(-n+2)]:border-b">
        <Stat label="Sunlight" value={`${Math.round(a.sunPct)}%`} bar={a.sunPct} color="var(--sun)" delta={s && <Delta v={s.sunPct - a.sunPct} />} />
        <Stat label="Earth in view" value={`${Math.round(a.earthPct)}%`} bar={a.earthPct} color="var(--earth)" delta={s && <Delta v={s.earthPct - a.earthPct} />} />
        <Stat label="Both at once" value={`${Math.round(a.bothPct)}%`} bar={a.bothPct} color="var(--both)" delta={s && <Delta v={s.bothPct - a.bothPct} />} />
        <Stat label="Longest blackout" value={fmtHours(a.longestBlackoutH)} delta={s && <Delta v={s.longestBlackoutH - a.longestBlackoutH} unit="h" invert />} />
      </div>
    </section>
  )
}
