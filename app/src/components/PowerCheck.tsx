import { useMemo } from 'react'
import { EXAMPLE_LANDER, fmtDate, fmtHours, idxToDate, simulateBattery, type Lander } from '../lib/engine'
import type { Dataset, Mission, Site, Verdict } from '../lib/types'

const vStyle: Record<Verdict, string> = {
  GO: 'bg-both text-white dark:text-bg',
  RISKY: 'bg-risk text-white dark:text-bg',
  'NO-GO': 'bg-nogo text-white dark:text-bg',
}

function Field({ label, unit, value, min, max, step, onChange }: { label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-ink-3">{label}</span>
      <span className="flex items-center rounded-[8px] bg-surface shadow-control focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_35%,transparent)]">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v))) }}
          className="w-full min-w-0 bg-transparent px-2.5 py-1.5 text-[13px] tabular outline-none"
        />
        <span className="pr-2.5 text-[11px] text-ink-3">{unit}</span>
      </span>
    </label>
  )
}

/**
 * Battery check: steps the lander's battery through the mission using the Sun-disc fraction in
 * view at each step. GO = never below the reserve, RISKY = dips under it, NO-GO = runs flat.
 */
export default function PowerCheck({ ds, site, mission, lander, onChange, screen }: {
  ds: Dataset
  site: Site
  mission: Mission
  lander: Lander
  onChange: (l: Lander) => void
  screen: Verdict
}) {
  const r = useMemo(() => simulateBattery(ds, site, mission.startIdx, mission.durationH, lander), [ds, site, mission.startIdx, mission.durationH, lander])
  const set = (k: keyof Lander) => (v: number) => onChange({ ...lander, [k]: v })
  const isExample = (Object.keys(EXAMPLE_LANDER) as (keyof Lander)[]).every((k) => lander[k] === EXAMPLE_LANDER[k])

  // Sparkline of the charge over the mission, with the reserve line.
  const W = 260, H = 54
  const n = r.soc.length
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W)
  const y = (p: number) => H - 2 - (p / 100) * (H - 4)
  const path = r.soc.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join('')

  const offset = r.belowReserveIdx !== null ? (r.belowReserveIdx - mission.startIdx) * ds.meta.stepHours : null
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-snug text-ink-2">
        Enter your lander&rsquo;s numbers. The battery starts full and charges from the share of the Sun&rsquo;s disc in view at each step.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Battery" unit="Wh" value={lander.batteryWh} min={10} max={100000} step={50} onChange={set('batteryWh')} />
        <Field label="Power draw" unit="W" value={lander.loadW} min={0} max={10000} step={5} onChange={set('loadW')} />
        <Field label="Array, full Sun" unit="W" value={lander.arrayW} min={0} max={20000} step={10} onChange={set('arrayW')} />
        <Field label="Keep at least" unit="%" value={lander.reservePct} min={0} max={90} step={5} onChange={set('reservePct')} />
      </div>
      {isExample && <p className="-mt-1 text-[11px] text-ink-3">Example numbers, not a real lander. Replace them with yours.</p>}

      <div className="rounded-[10px] bg-surface-2 p-3">
        <div className="flex items-center gap-2.5">
          <span className={`rounded-lg px-2.5 py-1 font-display text-[15px] font-semibold ${vStyle[r.verdict]}`}>{r.verdict}</span>
          <div className="min-w-0 text-[12px] leading-snug">
            <div className="font-medium tabular">Lowest charge {Math.round(r.minPct)}%</div>
            <div className="text-ink-3 tabular">{fmtDate(idxToDate(ds, r.minIdx))}</div>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2.5 h-[54px] w-full" preserveAspectRatio="none" role="img" aria-label={`Battery charge over the mission, lowest ${Math.round(r.minPct)}%`}>
          <line x1={0} x2={W} y1={y(lander.reservePct)} y2={y(lander.reservePct)} stroke="var(--color-nogo)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity={0.7} />
          <path d={path} fill="none" stroke="var(--color-both)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        </svg>
        <p className="mt-1.5 text-[11px] leading-snug text-ink-2">
          {r.flat
            ? `The battery runs flat ${offset !== null ? `about ${fmtHours(offset)} after landing` : 'during the mission'}.`
            : r.belowReserveIdx !== null
              ? `Charge drops under the ${lander.reservePct}% reserve ${fmtHours(offset ?? 0)} after landing.`
              : `Charge stays above the ${lander.reservePct}% reserve for the whole mission.`}
          {' '}Average balance {r.netW >= 0 ? '+' : '−'}{Math.abs(Math.round(r.netW))} W.
          {screen !== r.verdict && ` The screening verdict says ${screen}; this check uses your lander.`}
        </p>
      </div>
      <p className="text-[11px] leading-snug text-ink-3">
        Assumes the array turns to face the Sun and the draw is constant. Heater needs in the dark and battery ageing are not modelled.
      </p>
    </div>
  )
}
