import { AnimatePresence, motion } from 'framer-motion'
import { fmtDate, fmtHours, idxToDate, MARGINAL_DEG, SCREEN } from '../lib/engine'
import type { Analysis, Dataset, Verdict } from '../lib/types'

const vStyle: Record<Verdict, string> = {
  GO: 'bg-both text-white dark:text-bg',
  RISKY: 'bg-risk text-white dark:text-bg',
  'NO-GO': 'bg-nogo text-white dark:text-bg',
}
const vText: Record<Verdict, string> = { GO: 'text-both-ink', RISKY: 'text-risk-ink', 'NO-GO': 'text-nogo-ink' }

function Delta({ v, unit = '%', invert = false }: { v: number; unit?: string; invert?: boolean }) {
  if (Math.abs(v) < 0.5) return <span className="text-ink-3">no change</span>
  const good = invert ? v < 0 : v > 0
  return <span className={good ? 'text-both-ink' : 'text-nogo-ink'}>{v > 0 ? '+' : '−'}{Math.round(Math.abs(v))}{unit === 'h' ? ' h' : unit}</span>
}

function Stat({ label, value, bar, color, delta, note }: { label: string; value: string; bar?: number; color?: string; delta?: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular leading-none">{value}</div>
      {bar !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
          <motion.div className="h-full rounded-full" style={{ background: color }} initial={false} animate={{ width: `${bar}%` }} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }} />
        </div>
      )}
      {note && <div className="mt-1.5 text-[11px] leading-snug text-ink-3 tabular">{note}</div>}
      {delta && <div className="mt-1.5 text-xs tabular">{delta}</div>}
    </div>
  )
}

export default function SummaryStrip({ ds, a: full, slipped, slipDays, needComms, earthMaskDeg, flush = false, soFar }: { ds: Dataset; a: Analysis; slipped: Analysis | null; slipDays: number; needComms: boolean; earthMaskDeg: number; flush?: boolean
  /** While the Orbit timelapse plays: the numbers from landing up to now. The verdict stays the whole mission's. */
  soFar?: { a: Analysis; label: string } | null }) {
  const a = full
  const w = a.firstWindow
  const s = slipped && slipDays > 0 && !soFar ? slipped : null
  const n = soFar?.a ?? a
  return (
    <section className={`grid overflow-hidden lg:grid-cols-[minmax(260px,1.3fr)_repeat(4,minmax(0,1fr))] ${flush ? 'bg-transparent' : 'rounded-[14px] bg-surface shadow-card'}`}>
      <div className="flex items-start gap-4 border-b border-line p-4 lg:border-b-0 lg:border-r">
        <div className="flex shrink-0 flex-col items-center gap-1">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={a.verdict}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            title={`Screening verdict from the team's own defaults, not NASA criteria: GO = need met ${SCREEN.goCoverage}%+ of the mission with no gap over ${SCREEN.goGapH} h; RISKY = ${SCREEN.riskyCoverage}%+ and gaps up to ${SCREEN.riskyGapH} h. For a decision, use the Power check with your lander's numbers.`}
            className={`shrink-0 cursor-help rounded-xl px-3.5 py-2 font-display text-xl font-semibold ${vStyle[a.verdict]}`}
          >
            {a.verdict}
          </motion.div>
        </AnimatePresence>
        </div>
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
            <div className="mt-0.5 text-sm text-nogo-ink">No window in the data range</div>
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
        <Stat label="Sunlight" value={`${Math.round(n.sunPct)}%`} bar={n.sunPct} color="var(--sun)" delta={s && <Delta v={s.sunPct - a.sunPct} />}
          note={soFar ? soFar.label : n.sunPartialPct >= 0.5 ? `Sun only partly up ${Math.round(n.sunPartialPct)}% of the time` : undefined} />
        <Stat label="Earth in view" value={`${Math.round(n.earthPct)}%`} bar={n.earthPct} color="var(--earth)" delta={s && <Delta v={s.earthPct - a.earthPct} />}
          note={soFar ? soFar.label : n.earthMarginalPct >= 0.5 ? `${Math.round(n.earthMarginalPct)}% marginal: under ${earthMaskDeg > 0 ? earthMaskDeg : MARGINAL_DEG}° above the ridge` : undefined} />
        <Stat label="Both at once" note={soFar?.label} value={`${Math.round(n.bothPct)}%`} bar={n.bothPct} color="var(--both)" delta={s && <Delta v={s.bothPct - a.bothPct} />} />
        <Stat label="Longest blackout" note={soFar?.label} value={fmtHours(n.longestBlackoutH)} delta={s && <Delta v={s.longestBlackoutH - a.longestBlackoutH} unit="h" invert />} />
      </div>
    </section>
  )
}
