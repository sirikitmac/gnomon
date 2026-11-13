import { AnimatePresence, motion } from 'framer-motion'
import { useDeferredValue, useMemo, useState } from 'react'
import { fmtDateYear, fmtHours, idxToDate } from '../lib/engine'
import { planMissions } from '../lib/planner'
import type { Dataset, Mission, Verdict } from '../lib/types'

const vPill: Record<Verdict, string> = {
  GO: 'bg-both/15 text-both-ink',
  RISKY: 'bg-risk/15 text-risk-ink',
  'NO-GO': 'bg-nogo/15 text-nogo-ink',
}

/** "Plan it for me": best site + landing date for the current mission settings, across all sites. */
export default function PlanPanel({ ds, mission, siteId, todayIdx, active, onActivate, onUse }: {
  ds: Dataset
  mission: Mission
  siteId: string
  todayIdx: number | null
  active: boolean
  onActivate: () => void
  onUse: (siteId: string, idx: number) => void
}) {
  const [earliest, setEarliest] = useState(false)
  const durationH = useDeferredValue(mission.durationH)
  const needComms = useDeferredValue(mission.needComms)
  const fromIdx = todayIdx ?? 0
  const results = useMemo(
    () => (active ? planMissions(ds, durationH, needComms, { fromIdx, earliest }) : []),
    [active, ds, durationH, needComms, fromIdx, earliest]
  )
  const names = useMemo(() => new Map(ds.sites.map((s) => [s.id, s.name])), [ds])

  if (!active) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-ink-2">
          Search all {ds.sites.length} sites and every landing time (every 6 hours) for a {Math.round(mission.durationH / 24)}-day mission
          {mission.needComms ? ' that needs Sun and Earth' : ' that needs Sun'}, and get the five best options.
        </p>
        <button onClick={onActivate} className="min-h-10 rounded-[8px] bg-accent px-4 py-2 text-[13px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_0.5px_0_rgba(255,255,255,0.25)] transition-[transform,filter] duration-100 ease-out hover:brightness-105 active:scale-[0.97]">
          Plan it for me
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-3">
          {Math.round(durationH / 24)}-day mission, {needComms ? 'Sun + Earth' : 'Sun only'}, landing from {fmtDateYear(idxToDate(ds, fromIdx))}.
          Ranked by verdict, then coverage, then shortest blackout. Same-site results are at least 3 days apart.
        </p>
        <div className="grid grid-cols-2 gap-0.5 rounded-[9px] bg-surface-2 p-[2px] text-xs" role="radiogroup" aria-label="Sort results">
          {([[false, 'Best numbers'], [true, 'Earliest GO']] as const).map(([v, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={earliest === v}
              onClick={() => setEarliest(v)}
              className={`rounded-[7px] px-2.5 py-1 transition-[background-color,color,box-shadow] duration-150 ${earliest === v ? 'bg-surface font-medium text-ink shadow-control' : 'text-ink-2 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {results.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">No landing in the data range leaves room for this mission length.</p>
      ) : (
        <>
        <div className="hidden grid-cols-[1.5rem_minmax(0,1.4fr)_minmax(0,1.2fr)_5rem_4rem_5rem_auto] gap-x-3 px-3 pb-1 text-xs text-ink-3 sm:grid" aria-hidden>
          <span>#</span><span>Site</span><span>Landing</span><span>Verdict</span><span className="text-right">Coverage</span><span className="text-right">Blackout</span><span className="w-[4.6rem]" />
        </div>
        <ol className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {results.map((r, i) => {
              const inUse = r.siteId === siteId && r.idx === mission.startIdx
              return (
                <motion.li
                  key={`${r.siteId}-${r.idx}`}
                  layout="position"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-[10px] px-3 py-2.5 sm:grid-cols-[1.5rem_minmax(0,1.4fr)_minmax(0,1.2fr)_5rem_4rem_5rem_auto] ${inUse ? 'bg-surface-2 shadow-[inset_3px_0_0_var(--accent)]' : 'border-t border-line first:border-t-0'}`}
                >
                  <span className="text-xs tabular text-ink-3">{i + 1}</span>
                  <span className="min-w-0 text-sm font-medium">{names.get(r.siteId)}</span>
                  <button
                    onClick={() => onUse(r.siteId, r.idx)}
                    disabled={inUse}
                    className="row-span-2 w-[4.6rem] rounded-[7px] py-1.5 text-xs font-medium text-accent shadow-control transition-colors duration-150 hover:bg-accent/10 disabled:text-ink-3 disabled:shadow-none disabled:hover:bg-transparent sm:order-last sm:row-span-1"
                  >
                    {inUse ? 'In use' : 'Use this'}
                  </button>
                  <span className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2 sm:contents">
                    <span className="tabular sm:text-sm">{fmtDateYear(idxToDate(ds, r.idx))}</span>
                    <span><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${vPill[r.score.verdict]}`}>{r.score.verdict}</span></span>
                    <span className="tabular sm:text-right sm:text-sm">{Math.round(r.score.coveragePct)}%<span className="sm:hidden"> coverage</span></span>
                    <span className="tabular sm:text-right sm:text-sm"><span className="sm:hidden">blackout </span>{fmtHours(r.score.longestBlackoutH)}</span>
                  </span>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ol>
        </>
      )}
    </div>
  )
}
