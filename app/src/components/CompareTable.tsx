import { motion } from 'framer-motion'
import { analyze, fmtDate, fmtHours, hoursUntilChange, idxToDate } from '../lib/engine'
import type { Analysis, Dataset, Mission, Site, Verdict } from '../lib/types'

const vPill: Record<Verdict, string> = {
  GO: 'bg-both/15 text-both-ink',
  RISKY: 'bg-risk/15 text-risk-ink',
  'NO-GO': 'bg-nogo/15 text-nogo-ink',
}
const vRank: Record<Verdict, number> = { GO: 0, RISKY: 1, 'NO-GO': 2 }

function NowCell({ ds, flags, idx, color, setWord, riseWord }: { ds: Dataset; flags: number[]; idx: number; color: string; setWord: string; riseWord: string }) {
  const vis = !!flags[idx]
  const c = hoursUntilChange(ds, flags, idx)
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, opacity: vis ? 1 : 0.2 }} aria-hidden />
      <div className="leading-tight">
        <div className={vis ? '' : 'text-ink-3'}>{vis ? 'Up' : 'Down'}</div>
        <div className="text-xs text-ink-3 tabular">{c ? `${vis ? setWord : riseWord} in ${fmtHours(c.hours)}` : vis ? 'Stays up' : 'Stays down'}</div>
      </div>
    </div>
  )
}

interface Row { site: Site; a: Analysis; slipped: Analysis | null }

export default function CompareTable({ ds, mission, cursor, selectedId, onSelect }: {
  ds: Dataset
  mission: Mission
  cursor: number
  selectedId: string
  onSelect: (id: string) => void
}) {
  const slipIdx = mission.startIdx + (mission.slipDays * 24) / ds.meta.stepHours
  const rows: Row[] = ds.sites
    .map((site) => ({
      site,
      a: analyze(ds, site, mission.startIdx, mission),
      slipped: mission.slipDays > 0 ? analyze(ds, site, slipIdx, mission) : null,
    }))
    .sort((x, y) => vRank[x.a.verdict] - vRank[y.a.verdict] || y.a.coveragePct - x.a.coveragePct)

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-3">
            <th className="pb-2 font-normal" rowSpan={2}>Site</th>
            <th className="border-b border-line pb-1 font-normal" colSpan={2}>At {fmtDate(idxToDate(ds, cursor))}</th>
            <th className="pl-6" />
            <th className="border-b border-line pb-1 font-normal" colSpan={mission.slipDays > 0 ? 6 : 5}>
              Over the mission ({fmtHours(mission.durationH)} from {fmtDate(idxToDate(ds, mission.startIdx))})
            </th>
          </tr>
          <tr className="text-left text-xs text-ink-3">
            <th className="py-2 pr-4 font-normal">Sun</th>
            <th className="py-2 pr-4 font-normal">Earth</th>
            <th />
            <th className="py-2 pr-4 font-normal">Verdict</th>
            <th className="py-2 pr-4 text-right font-normal">Sunlight</th>
            <th className="py-2 pr-4 text-right font-normal">Earth in view</th>
            <th className="py-2 pr-4 text-right font-normal">Both</th>
            <th className="py-2 pr-4 text-right font-normal">Longest blackout</th>
            {mission.slipDays > 0 && <th className="py-2 font-normal">If {mission.slipDays} d late</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ site, a, slipped }) => {
            const active = site.id === selectedId
            return (
              <motion.tr
                layout="position"
                transition={{ duration: 0.25, ease: [0.645, 0.045, 0.355, 1] }}
                key={site.id}
                onClick={() => onSelect(site.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(site.id) } }}
                tabIndex={0}
                aria-selected={active}
                className={`cursor-pointer transition-colors duration-150 ${active ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}
              >
                <td className={`rounded-l-lg border-t border-line py-3 pl-3 pr-4 ${active ? 'shadow-[inset_3px_0_0_var(--accent)]' : ''}`}>
                  <div className="font-medium">{site.name}</div>
                  <div className="text-xs text-ink-3">{site.role}</div>
                </td>
                <td className="border-t border-line py-3 pr-4">
                  <NowCell ds={ds} flags={site.series.sunVis} idx={cursor} color="var(--sun)" setWord="Sets" riseWord="Rises" />
                </td>
                <td className="border-t border-line py-3 pr-4">
                  <NowCell ds={ds} flags={site.series.earthVis} idx={cursor} color="var(--earth)" setWord="Sets" riseWord="Rises" />
                </td>
                <td className="border-t border-line" />
                <td className="border-t border-line py-3 pr-4">
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${vPill[a.verdict]}`}>{a.verdict}</span>
                </td>
                <td className="border-t border-line py-3 pr-4 text-right tabular">{Math.round(a.sunPct)}%</td>
                <td className="border-t border-line py-3 pr-4 text-right tabular">{Math.round(a.earthPct)}%</td>
                <td className="border-t border-line py-3 pr-4 text-right tabular">{Math.round(a.bothPct)}%</td>
                <td className={`border-t border-line py-3 pr-4 text-right tabular ${mission.slipDays > 0 ? '' : 'rounded-r-lg'}`}>{fmtHours(a.longestBlackoutH)}</td>
                {slipped && (
                  <td className="rounded-r-lg border-t border-line py-3 pr-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${vPill[slipped.verdict]}`}>{slipped.verdict}</span>
                    {slipped.verdict !== a.verdict && <span className="ml-2 text-xs text-ink-3">was {a.verdict}</span>}
                  </td>
                )}
              </motion.tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
