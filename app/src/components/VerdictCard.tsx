import { AnimatePresence, motion } from 'framer-motion'
import { fmtDate, fmtHours, idxToDate } from '../lib/engine'
import type { Analysis, Dataset, Verdict } from '../lib/types'

const vStyle: Record<Verdict, string> = {
  GO: 'bg-both/15 text-both border-both/40',
  RISKY: 'bg-risk/15 text-risk border-risk/40',
  'NO-GO': 'bg-nogo/15 text-nogo border-nogo/40',
}

function Delta({ v, unit = '%' }: { v: number; unit?: string }) {
  if (Math.abs(v) < 0.5) return <span className="text-ink-500">±0</span>
  return <span className={v > 0 ? 'text-both' : 'text-nogo'}>{v > 0 ? '+' : ''}{Math.round(v)}{unit}</span>
}

export default function VerdictCard({ ds, a, slipped, slipDays, needComms }: { ds: Dataset; a: Analysis; slipped: Analysis | null; slipDays: number; needComms: boolean }) {
  const w = a.firstWindow
  const stats = [
    { label: 'Sun visible', v: a.sunPct, d: slipped && slipped.sunPct - a.sunPct, c: 'bg-sun' },
    { label: 'Earth visible', v: a.earthPct, d: slipped && slipped.earthPct - a.earthPct, c: 'bg-earth' },
    { label: 'Both', v: a.bothPct, d: slipped && slipped.bothPct - a.bothPct, c: 'bg-both' },
  ]
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-ink-500">Mission verdict</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={a.verdict}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className={`rounded-full border px-3 py-1 text-sm font-semibold tracking-wide ${vStyle[a.verdict]}`}
          >
            {a.verdict}
          </motion.span>
        </AnimatePresence>
      </div>

      <div>
        <div className="text-xs text-ink-500">{needComms ? 'Power + comms window' : 'Power window'} from landing</div>
        {w ? (
          <div className="mt-1 text-lg font-medium leading-snug tabular">
            {fmtDate(idxToDate(ds, w.from))} <span className="text-ink-500">→</span> {fmtDate(idxToDate(ds, w.to))}
            <div className="text-sm font-normal text-ink-300">{fmtHours((w.to - w.from) * ds.meta.stepHours)} continuous{w.from > a.startIdx ? `, starts ${fmtHours((w.from - a.startIdx) * ds.meta.stepHours)} after landing` : ''}</div>
          </div>
        ) : (
          <div className="mt-1 text-lg text-nogo">No window in range</div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-ink-300">{s.label}</span>
              <span className="tabular">
                {Math.round(s.v)}%{slipped && slipDays > 0 && <span className="ml-2"><Delta v={s.d ?? 0} /></span>}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-space-700">
              <motion.div className={`h-full rounded-full ${s.c}`} initial={false} animate={{ width: `${s.v}%` }} transition={{ duration: 0.4, ease: [0.645, 0.045, 0.355, 1] }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-space-900 p-2.5">
          <div className="text-ink-500">Coverage</div>
          <div className="mt-0.5 text-base tabular">{Math.round(a.coveragePct)}%{slipped && slipDays > 0 && <span className="ml-1.5 text-xs"><Delta v={slipped.coveragePct - a.coveragePct} /></span>}</div>
        </div>
        <div className="rounded-lg bg-space-900 p-2.5">
          <div className="text-ink-500">Longest blackout</div>
          <div className="mt-0.5 text-base tabular">{fmtHours(a.longestBlackoutH)}{slipped && slipDays > 0 && <span className="ml-1.5 text-xs"><Delta v={-(slipped.longestBlackoutH - a.longestBlackoutH)} unit="h" /></span>}</div>
        </div>
      </div>

      {slipped && slipDays > 0 && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${vStyle[slipped.verdict]}`}>
          If landing slips {slipDays} day{slipDays > 1 ? 's' : ''}: <b>{slipped.verdict}</b>
          {slipped.verdict !== a.verdict ? ` (was ${a.verdict})` : ' (unchanged)'}
        </div>
      )}
    </div>
  )
}
