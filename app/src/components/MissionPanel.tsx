import type { Dataset, Mission, SunMode } from '../lib/types'
import { clampIdx, dateToIdx, fmtDate, idxToDate } from '../lib/engine'

function toLocalInput(d: Date) {
  return d.toISOString().slice(0, 16)
}

export default function MissionPanel({ ds, mission, onChange, onBest, onPlan, nowIndex, onNow, sunMode, onSunMode, earthMaskDeg, onEarthMask }: {
  ds: Dataset
  mission: Mission
  onChange: (m: Mission) => void
  onBest: () => void
  onPlan: () => void
  nowIndex: number | null
  onNow: (idx: number) => void
  sunMode: SunMode
  onSunMode: (m: SunMode) => void
  earthMaskDeg: number
  onEarthMask: (deg: number) => void
}) {
  const start = idxToDate(ds, mission.startIdx)
  const min = toLocalInput(idxToDate(ds, 0))
  const max = toLocalInput(idxToDate(ds, ds.meta.count - 1))
  const days = Math.round(mission.durationH / 24)
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between text-xs text-ink-3">
          <span>Landing (UTC)</span>
          <button
            type="button"
            disabled={nowIndex === null}
            onClick={() => nowIndex !== null && onNow(nowIndex)}
            title={nowIndex === null ? `Today is outside the data range (${fmtDate(idxToDate(ds, 0))} to ${fmtDate(idxToDate(ds, ds.meta.count - 1))})` : 'Land now'}
            className="rounded-md px-1.5 py-0.5 font-medium text-accent transition-colors duration-150 hover:bg-accent/10 disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent"
          >
            Now
          </button>
        </span>
        <input
          type="datetime-local"
          value={toLocalInput(start)}
          min={min}
          max={max}
          onChange={(e) => {
            if (!e.target.value) return
            onChange({ ...mission, startIdx: clampIdx(ds, dateToIdx(ds, new Date(e.target.value + ':00Z'))) })
          }}
          className="rounded-[8px] bg-surface px-3 py-2 text-[13px] tabular text-ink shadow-control outline-none transition-shadow duration-150 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="flex justify-between text-xs text-ink-3">
          <span>Mission length</span>
          <span className="tabular font-medium text-ink">{days} days</span>
        </span>
        <input type="range" min={1} max={28} value={days} onChange={(e) => onChange({ ...mission, durationH: +e.target.value * 24 })} />
      </label>

      <button
        role="switch"
        aria-checked={mission.needComms}
        onClick={() => onChange({ ...mission, needComms: !mission.needComms })}
        className="flex min-h-10 items-center justify-between gap-3 rounded-[8px] bg-surface px-3 py-2 text-[13px] shadow-control"
      >
        <span className="text-left">Needs direct-to-Earth comms</span>
        <span className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ${mission.needComms ? 'bg-both' : 'bg-line-strong'}`}>
          <span className={`absolute left-0 top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25),0_0_0_0.5px_rgba(0,0,0,0.04)] transition-transform duration-200 ease-out ${mission.needComms ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
        </span>
      </button>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-ink-3">Count the Sun as up when</span>
        <div className="grid grid-cols-2 gap-0.5 rounded-[9px] bg-surface-2 p-[2px] text-xs" role="radiogroup" aria-label="Sun rule">
          {([['centre', 'Its centre clears'], ['firstLight', 'Its top edge clears']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={sunMode === v}
              onClick={() => onSunMode(v)}
              className={`rounded-[7px] px-2 py-1.5 transition-[background-color,color,box-shadow] duration-150 ${sunMode === v ? 'bg-surface font-medium text-ink shadow-control' : 'text-ink-2 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="flex justify-between text-xs text-ink-3">
          <span>Earth must clear the ridge by</span>
          <span className="tabular font-medium text-ink">{earthMaskDeg === 0 ? 'any amount' : `${earthMaskDeg}°`}</span>
        </span>
        <input type="range" min={0} max={5} step={1} value={earthMaskDeg} onChange={(e) => onEarthMask(+e.target.value)} aria-describedby="earth-mask-help" />
        <span id="earth-mask-help" className="text-[11px] leading-snug text-ink-3">
          Close to the ridge the antenna looks along the ground, so low contact is flagged as marginal. Raise this to make the verdict require clearance; set it from your radio&rsquo;s needs.
        </span>
      </label>

      <label id="slip-test" className="-m-1.5 flex flex-col gap-1.5 rounded-[10px] p-1.5">
        <span className="flex justify-between text-xs text-ink-3">
          <span>Slip Test: delay the landing by</span>
          <span className="tabular text-risk-ink">+{mission.slipDays} d</span>
        </span>
        <input type="range" min={0} max={14} value={mission.slipDays} onChange={(e) => onChange({ ...mission, slipDays: +e.target.value })} className="[accent-color:var(--color-risk)]" />
      </label>

      <button onClick={onBest} className="min-h-10 rounded-[8px] bg-accent px-3 py-2 text-[13px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_0.5px_0_rgba(255,255,255,0.25)] transition-[transform,filter] duration-100 ease-out hover:brightness-105 active:scale-[0.97]">
        Find the best landing date
      </button>
      <button onClick={onPlan} className="-mt-2 min-h-10 rounded-[8px] bg-surface px-3 py-2 text-[13px] font-medium text-accent shadow-control transition-[transform,background-color] duration-100 ease-out hover:bg-accent/5 active:scale-[0.97]">
        Plan it for me: best site and date
      </button>
    </div>
  )
}
