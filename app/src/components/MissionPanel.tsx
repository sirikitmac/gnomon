import type { Dataset, Mission } from '../lib/types'
import { clampIdx, dateToIdx, idxToDate } from '../lib/engine'

function toLocalInput(d: Date) {
  return d.toISOString().slice(0, 16)
}

export default function MissionPanel({ ds, mission, onChange, onBest }: {
  ds: Dataset
  mission: Mission
  onChange: (m: Mission) => void
  onBest: () => void
}) {
  const start = idxToDate(ds, mission.startIdx)
  const min = toLocalInput(idxToDate(ds, 0))
  const max = toLocalInput(idxToDate(ds, ds.meta.count - 1))
  const days = Math.round(mission.durationH / 24)
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-ink-3">Landing (UTC)</span>
        <input
          type="datetime-local"
          value={toLocalInput(start)}
          min={min}
          max={max}
          onChange={(e) => {
            if (!e.target.value) return
            onChange({ ...mission, startIdx: clampIdx(ds, dateToIdx(ds, new Date(e.target.value + ':00Z'))) })
          }}
          className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm tabular text-ink outline-none focus:border-earth [color-scheme:dark]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="flex justify-between text-xs text-ink-3">
          <span>Mission length</span>
          <span className="tabular text-ink">{days} days</span>
        </span>
        <input type="range" min={1} max={28} value={days} onChange={(e) => onChange({ ...mission, durationH: +e.target.value * 24 })} />
      </label>

      <button
        role="switch"
        aria-checked={mission.needComms}
        onClick={() => onChange({ ...mission, needComms: !mission.needComms })}
        className="flex items-center justify-between rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
      >
        <span className="text-left">Needs direct-to-Earth comms</span>
        <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${mission.needComms ? 'bg-earth' : 'bg-line-strong'}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-200 ease-out ${mission.needComms ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </span>
      </button>

      <label className="flex flex-col gap-1.5">
        <span className="flex justify-between text-xs text-ink-3">
          <span>Slip Test: delay the landing by</span>
          <span className="tabular text-risk">+{mission.slipDays} d</span>
        </span>
        <input type="range" min={0} max={14} value={mission.slipDays} onChange={(e) => onChange({ ...mission, slipDays: +e.target.value })} className="[accent-color:var(--color-risk)]" />
      </label>

      <button onClick={onBest} className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-bg transition-transform duration-100 ease-out active:scale-[0.97]">
        Find the best landing date
      </button>
    </div>
  )
}
