import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { calendarMonths, dayStartIdx, type DayCell, type MonthBlock } from '../lib/calendar'
import { fmtDay, fmtHours, idxToDate, perDay } from '../lib/engine'
import type { Dataset, Mission, Site, Verdict } from '../lib/types'

const COLOR: Record<Verdict, string> = { GO: '--both', RISKY: '--risk', 'NO-GO': '--nogo' }
const INK: Record<Verdict, string> = { GO: 'text-both-ink', RISKY: 'text-risk-ink', 'NO-GO': 'text-nogo-ink' }
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const HATCH = 'repeating-linear-gradient(135deg, var(--line-strong) 0 2px, transparent 2px 5px)'

const mixOf = (c: DayCell) => Math.round(30 + 0.7 * c.score.coveragePct)

/** "November 2026" -> "Nov '26", used for the compact phone year view so titles never wrap. */
const shortLabel = (label: string) => `${label.slice(0, 3)} '${label.slice(-2)}`

function cellBg(c: DayCell): string {
  if (!c.score.complete) return HATCH
  // Intensity by coverage: 30% tint at 0% coverage up to the full colour at 100%.
  return `color-mix(in srgb, var(${COLOR[c.score.verdict]}) ${mixOf(c)}%, var(--surface-2))`
}

/** Text on a cell: dark ink on pale tints, white on strong colour, so numbers stay readable. */
const cellInk = (c: DayCell) => (!c.score.complete ? 'text-ink-3' : mixOf(c) >= 70 ? 'text-white [text-shadow:0_0.5px_1px_rgba(0,0,0,0.35)]' : 'text-ink')

export type CellLabel = 'day' | 'coverage'

function describe(ds: Dataset, c: DayCell): string {
  const day = fmtDay(idxToDate(ds, c.idx))
  if (!c.score.complete) return `${day}: mission would run past the end of the data`
  return `${day}: ${c.score.verdict}, ${Math.round(c.score.coveragePct)}% coverage, longest blackout ${fmtHours(c.score.longestBlackoutH)}`
}

const Months = memo(function Months({ ds, months, landingDay, todayDay, roving, onHover, onPick, onKey, label }: {
  ds: Dataset
  months: MonthBlock[]
  label: CellLabel
  landingDay: number
  todayDay: number | null
  roving: number
  onHover: (c: DayCell | null) => void
  onPick: (idx: number) => void
  onKey: (e: React.KeyboardEvent, idx: number) => void
}) {
  return (
    <div className="lc-months grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-x-6 gap-y-5" role="grid" aria-label="Landing days by verdict">
      {months.map((m) => (
        <div key={m.key} role="rowgroup" className="lc-month">
          <div className="lc-title mb-1.5 text-[13px] font-semibold">
            <span className="lc-title-full">{m.label}</span>
            <span className="lc-title-short" aria-hidden>{shortLabel(m.label)}</span>
          </div>
          <div className="lc-week grid grid-cols-7 gap-1 text-center text-[10px] text-ink-3" aria-hidden>
            {WEEK.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="lc-days mt-1 grid grid-cols-7 gap-1" role="row">
            {Array.from({ length: m.lead }, (_, i) => <span key={'l' + i} />)}
            {m.days.map((c, i) => {
              if (!c) return <span key={i} className="lc-cell aspect-square rounded-[6px] bg-surface-2/50" />
              const landing = c.idx === landingDay
              const today = c.idx === todayDay
              return (
                <button
                  key={i}
                  type="button"
                  role="gridcell"
                  data-idx={c.idx}
                  tabIndex={c.idx === roving ? 0 : -1}
                  aria-label={describe(ds, c) + (today ? ' (today)' : '') + (landing ? ' (selected landing day)' : '')}
                  aria-selected={landing}
                  onClick={() => onPick(c.idx)}
                  onMouseEnter={() => onHover(c)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(c)}
                  onKeyDown={(e) => onKey(e, c.idx)}
                  className={`lc-cell relative grid aspect-square place-items-center rounded-[6px] text-[11px] font-medium tabular leading-none transition-transform duration-100 hover:scale-110 focus-visible:z-10 ${cellInk(c)} ${landing ? 'z-[1] ring-2 ring-ink ring-offset-1 ring-offset-surface' : ''}`}
                  style={{ background: cellBg(c) }}
                >
                  {label === 'day' ? c.day : (
                    <>
                      <span className="lc-cov">{c.score.complete ? Math.round(c.score.coveragePct) : '–'}</span>
                      {/* phone year view: no percentages in the tiny cells, just the date over the heatmap fill */}
                      <span className="lc-day-alt">{c.day}</span>
                    </>
                  )}
                  {today && <span className="lc-today absolute bottom-[3px] left-1/2 h-[4px] w-[4px] -translate-x-1/2 rounded-full bg-current" />}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
})

/** Month-by-month calendar: each day coloured by the verdict of a mission landing at 00:00 UTC. */
export default function LaunchCalendar({ ds, site, mission, todayIdx, onPick }: {
  ds: Dataset
  site: Site
  mission: Mission
  todayIdx: number | null
  onPick: (idx: number) => void
}) {
  // Deferred so dragging the mission-length slider never waits on the whole calendar.
  const durationH = useDeferredValue(mission.durationH)
  const needComms = useDeferredValue(mission.needComms)
  const months = useMemo(() => calendarMonths(ds, site, durationH, needComms), [ds, site, durationH, needComms])
  const byIdx = useMemo(() => {
    const map = new Map<number, DayCell>()
    for (const m of months) for (const c of m.days) if (c) map.set(c.idx, c)
    return map
  }, [months])
  const stale = durationH !== mission.durationH || needComms !== mission.needComms

  const landingDay = dayStartIdx(ds, mission.startIdx)
  const todayDay = todayIdx === null ? null : dayStartIdx(ds, todayIdx)
  const [hover, setHover] = useState<DayCell | null>(null)
  const [focusDay, setFocusDay] = useState<number | null>(null)
  const roving = focusDay !== null && byIdx.has(focusDay) ? focusDay : byIdx.has(landingDay) ? landingDay : (months[0]?.days.find(Boolean)?.idx ?? 0)
  const root = useRef<HTMLDivElement>(null)
  // Keep the grid memoized even though the parent hands us a new callback every render.
  const pickRef = useRef(onPick)
  useEffect(() => { pickRef.current = onPick }, [onPick])
  const pick = useCallback((idx: number) => { setFocusDay(idx); pickRef.current(idx) }, [])

  const onKey = useCallback((e: React.KeyboardEvent, idx: number) => {
    const d = perDay(ds)
    const move: Record<string, number> = { ArrowLeft: -d, ArrowRight: d, ArrowUp: -7 * d, ArrowDown: 7 * d }
    if (!(e.key in move)) return
    e.preventDefault()
    let next = idx + move[e.key]
    if (!byIdx.has(next)) next = idx
    setFocusDay(next)
    root.current?.querySelector<HTMLButtonElement>(`[data-idx="${next}"]`)?.focus()
  }, [ds, byIdx])

  const [label, setLabel] = useState<CellLabel>('day')
  const shown = hover ?? byIdx.get(landingDay) ?? null
  return (
    <div ref={root}>
      <div className="lc-summary mb-3 flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] bg-surface-2 px-3 py-2 text-[13px]" aria-live="polite">
        {shown ? (
          <>
            <span className="tabular font-medium">{fmtDay(idxToDate(ds, shown.idx))}</span>
            {shown.score.complete ? (
              <>
                <span className={`font-semibold ${INK[shown.score.verdict]}`}>{shown.score.verdict}</span>
                <span className="tabular text-ink-2">{Math.round(shown.score.coveragePct)}% coverage</span>
                <span className="tabular text-ink-2">longest blackout {fmtHours(shown.score.longestBlackoutH)}</span>
              </>
            ) : (
              <span className="text-ink-3">Mission would run past the end of the data (Dec 2028)</span>
            )}
            {shown.idx === landingDay && <span className="text-xs text-ink-3">selected landing day</span>}
          </>
        ) : (
          <span className="text-ink-3"><span className="lc-hint-desk">Hover or focus a day to see its verdict. Click to land that day.</span><span className="lc-hint-mob">Tap a day to see its verdict and land then.</span></span>
        )}
        {stale && <span className="text-xs text-ink-3">Updating…</span>}
        <div className="lc-toggle ml-auto grid grid-cols-2 gap-0.5 rounded-[9px] bg-surface p-[2px] text-xs shadow-control" role="radiogroup" aria-label="Number shown in each day">
          {([['day', 'Date'], ['coverage', 'Coverage %']] as const).map(([v, t]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={label === v}
              onClick={() => setLabel(v)}
              className={`rounded-[7px] px-2.5 py-1 transition-[background-color,color] duration-150 ${label === v ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <Months ds={ds} months={months} landingDay={landingDay} todayDay={todayDay} roving={roving} onHover={setHover} onPick={pick} onKey={onKey} label={label} />

      <div className="lc-legend mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-3">
        {(['GO', 'RISKY', 'NO-GO'] as const).map((v) => (
          <span key={v} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: `var(${COLOR[v]})` }} />{v}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-8 rounded-[3px]" style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--both) 30%, var(--surface-2)), var(--both))' }} />
          darker = more coverage
        </span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: HATCH }} />runs past the data</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] ring-2 ring-ink ring-offset-1 ring-offset-surface" />landing day</span>
        <span className="flex items-center gap-1.5"><span className="h-[4px] w-[4px] rounded-full bg-ink" />today</span>
      </div>
    </div>
  )
}
