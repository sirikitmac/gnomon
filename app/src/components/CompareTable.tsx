import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { compareSites } from '../lib/compare'
import { fmtDate, fmtHours, idxToDate, linkFlags } from '../lib/engine'
import type { Dataset, Mission, Site, Verdict } from '../lib/types'

const vPill: Record<Verdict, string> = {
  GO: 'bg-both/15 text-both-ink',
  RISKY: 'bg-risk/15 text-risk-ink',
  'NO-GO': 'bg-nogo/15 text-nogo-ink',
}

// What is up at the site in each data step: bit 1 = Sun, bit 2 = Earth (the comms link).
const STATE_FILL = ['var(--line-strong)', 'var(--sun)', 'var(--earth)', 'var(--both)']
const STATE_WORDS = ['Neither up', 'Sun only', 'Earth only', 'Sun and Earth']

function states(site: Site, from: number, n: number): number[] {
  const sun = site.series.sunVis, link = linkFlags(site)
  return Array.from({ length: n }, (_, k) => (sun[from + k] ? 1 : 0) + (link[from + k] ? 2 : 0))
}

/** One site's mission as a single ribbon: each data step coloured by what is up. Runs merged into rects. */
function Ribbon({ st, hover }: { st: number[]; hover: number | null }) {
  const runs: { x: number; w: number; s: number }[] = []
  for (let k = 0; k < st.length;) {
    let j = k
    while (j < st.length && st[j] === st[k]) j++
    runs.push({ x: k, w: j - k, s: st[k] })
    k = j
  }
  return (
    <svg viewBox={`0 0 ${st.length} 14`} preserveAspectRatio="none" className="block h-3.5 w-full overflow-hidden rounded-[4px]" aria-hidden>
      {runs.map((r) => <rect key={r.x} x={r.x} y={0} width={r.w + 0.02} height={14} fill={STATE_FILL[r.s]} />)}
      {hover !== null && <rect x={hover} y={0} width={Math.max(0.6, st.length / 300)} height={14} fill="var(--ink)" opacity={0.85} />}
    </svg>
  )
}

/** Day marks above the ribbons, labelled every few days so they never crowd. */
function Scale({ ds, mission, n }: { ds: Dataset; mission: Mission; n: number }) {
  const days = (n * ds.meta.stepHours) / 24
  const every = days <= 12 ? 2 : days <= 20 ? 4 : 7
  const marks = Array.from({ length: Math.floor(days) + 1 }, (_, d) => d)
  return (
    <div className="relative mt-1 h-5" aria-hidden>
      {marks.map((d) => (
        <span key={d} className="absolute top-0 -translate-x-1/2" style={{ left: `${(d / days) * 100}%` }}>
          {d % every === 0 && d < days && (
            <span className="block whitespace-nowrap text-[10.5px] font-semibold text-ink-3 tabular">
              {idxToDate(ds, mission.startIdx + (d * 24) / ds.meta.stepHours).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
            </span>
          )}
          <span className={`absolute left-1/2 top-[15px] h-[5px] w-px ${d % every === 0 ? 'bg-ink-3/60' : 'bg-line-strong'}`} />
        </span>
      ))}
    </div>
  )
}

function RowMenu({ site, isMine, canRemove, onSelect, onRemove }: { site: Site; isMine: boolean; canRemove: boolean; onSelect: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onDown); window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  const item = 'flex w-full rounded-[8px] px-3 py-2 text-left text-[13px] font-medium transition-colors duration-100 hover:bg-surface-2 disabled:text-ink-3 disabled:hover:bg-transparent'
  return (
    <div ref={wrap} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More for ${site.name}`}
        className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
      >
        <svg width="14" height="4" viewBox="0 0 14 4" fill="currentColor" aria-hidden><circle cx="2" cy="2" r="1.5" /><circle cx="7" cy="2" r="1.5" /><circle cx="12" cy="2" r="1.5" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-30 w-[220px] rounded-[12px] border border-line bg-surface/95 p-1.5 shadow-pop backdrop-blur-2xl">
          <button role="menuitem" type="button" disabled={isMine} className={item} onClick={() => { onSelect(); setOpen(false) }}>
            {isMine ? 'This is your site' : 'Make this my site'}
          </button>
          <button role="menuitem" type="button" disabled={!canRemove} className={item} title={canRemove ? undefined : 'Keep at least one site'} onClick={() => { onRemove(); setOpen(false) }}>
            Remove from the comparison
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Compare page: every chosen site for the same landing and mission. Each row is a mission ribbon
 * (what is up every 2 h), the share of the mission with what the mission needs, the longest gap,
 * and the verdict. Hover the ribbons to read one moment across all sites; drag them to move the
 * landing for every site at once (it snaps to the data's 2-hour steps and stays inside the data).
 */
export default function CompareTable({ ds, mission, ids, selectedId, onSelect, onRemove, onLanding }: {
  ds: Dataset
  mission: Mission
  /** Sites to show; all when omitted. */
  ids?: string[]
  selectedId: string
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onLanding: (idx: number) => void
}) {
  const rows = compareSites(ds, mission, ids)
  const n = Math.max(1, Math.round(mission.durationH / ds.meta.stepHours))
  const maxStart = ds.meta.count - n
  const stripes = useMemo(() => new Map(rows.map((r) => [r.site.id, states(r.site, mission.startIdx, n)])), [rows, mission.startIdx, n])
  const [hover, setHover] = useState<number | null>(null)
  const drag = useRef<{ x: number; start: number; moved: boolean; width: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const firstLanding = useRef(mission.startIdx)
  const moved = mission.startIdx !== firstLanding.current

  const stepAt = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)))
  }
  const ribbonHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      drag.current = { x: e.clientX, start: mission.startIdx, moved: false, width: e.currentTarget.getBoundingClientRect().width }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current
      if (!d) { setHover(stepAt(e)); return }
      // Like panning a map: pull the ribbons left to bring later landings in.
      const steps = Math.round(((d.x - e.clientX) / d.width) * n)
      if (Math.abs(e.clientX - d.x) > 3) { d.moved = true; setDragging(true); setHover(null) }
      if (d.moved) onLanding(Math.max(0, Math.min(maxStart, d.start + steps)))
    },
    onPointerUp: () => { drag.current = null; setDragging(false) },
    onPointerCancel: () => { drag.current = null; setDragging(false) },
    onPointerLeave: () => { if (!drag.current) setHover(null) },
    onClickCapture: (e: React.MouseEvent) => { if (dragging || drag.current?.moved) e.stopPropagation() },
  }

  const exportCsv = () => {
    const head = ['Site', 'Verdict', mission.needComms ? 'Sun and Earth %' : 'Sunlight %', 'Sunlight %', 'Earth in view %', 'Longest gap (h)', 'Landing (UTC)', 'Mission (days)']
    const lines = rows.map(({ site, a }) => [
      site.name, a.verdict, a.coveragePct.toFixed(1), a.sunPct.toFixed(1), a.earthPct.toFixed(1), String(a.longestBlackoutH),
      idxToDate(ds, mission.startIdx).toISOString().slice(0, 16).replace('T', ' '), String(mission.durationH / 24),
    ])
    const csv = [head, ...lines].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `gnomon-compare-${idxToDate(ds, mission.startIdx).toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const needLabel = mission.needComms ? 'Sun and Earth' : 'Sunlight'
  const hoverDate = hover !== null ? fmtDate(idxToDate(ds, mission.startIdx + hover)) : null

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-2">
          {hoverDate
            ? <>At <span className="font-semibold text-ink tabular">{hoverDate}</span></>
            : <>Drag the ribbons to move the landing for every site. Hover to read one moment.</>}
        </p>
        <div className="flex items-center gap-2">
          {moved && (
            <button type="button" onClick={() => onLanding(firstLanding.current)} className="h-8 rounded-full px-3 text-[12.5px] font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink">
              Back to {fmtDate(idxToDate(ds, firstLanding.current))}
            </button>
          )}
          <button type="button" onClick={exportCsv} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-ink ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-surface-2 active:scale-[0.97]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 1.5v6M3.5 5L6 7.5 8.5 5M2 10h8" /></svg>
            Export CSV
          </button>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[11.5px] text-ink-3">
              <th className="border-y border-line px-3 py-2.5 align-bottom font-semibold">Site</th>
              <th className="w-[44%] border-y border-line px-3 pb-1.5 pt-2.5 align-bottom font-semibold">
                <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-ink-2">
                  {[3, 1, 2, 0].map((s) => (
                    <span key={s} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: STATE_FILL[s] }} />{STATE_WORDS[s]}</span>
                  ))}
                </div>
                <Scale ds={ds} mission={mission} n={n} />
              </th>
              <th className="border-y border-line px-3 py-2.5 text-right align-bottom font-semibold">{needLabel}</th>
              <th className="border-y border-line px-3 py-2.5 text-right align-bottom font-semibold">Longest gap</th>
              <th className="border-y border-line px-3 py-2.5 text-right align-bottom font-semibold">Verdict</th>
              <th className="w-10 border-y border-line" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ site, a, slipped }, i) => {
              const active = site.id === selectedId
              const st = stripes.get(site.id) ?? []
              return (
                <motion.tr
                  layout="position"
                  transition={{ duration: 0.25, ease: [0.645, 0.045, 0.355, 1] }}
                  key={site.id}
                  onClick={() => onSelect(site.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(site.id) } }}
                  tabIndex={0}
                  aria-selected={active}
                  className={`cursor-pointer transition-colors duration-150 ${active ? 'bg-ink/[0.055]' : i % 2 ? 'bg-ink/[0.025] hover:bg-ink/[0.045]' : 'hover:bg-ink/[0.035]'}`}
                >
                  <td className="rounded-l-[10px] px-3 py-3.5">
                    <div className="flex items-center gap-2 text-[14px] font-semibold">
                      {site.name}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-3">{shortNote(site)}</div>
                  </td>
                  <td
                    className={`px-3 py-3.5 ${dragging ? 'cursor-grabbing' : 'cursor-grab'} touch-pan-y select-none`}
                    {...ribbonHandlers}
                    title={hover !== null ? `${fmtDate(idxToDate(ds, mission.startIdx + hover))}: ${STATE_WORDS[st[hover] ?? 0]}` : undefined}
                  >
                    <Ribbon st={st} hover={hover} />
                    <div className="mt-1.5 flex gap-3.5 text-[11.5px] text-ink-3 tabular">
                      {hover !== null ? (
                        <span className="font-medium text-ink-2">{STATE_WORDS[st[hover] ?? 0]}</span>
                      ) : (
                        <>
                          <span className="flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-[2px] bg-sun" />Sun {Math.round(a.sunPct)}%</span>
                          <span className="flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-[2px] bg-earth" />Earth {Math.round(a.earthPct)}%</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right text-[22px] font-semibold tracking-[-0.02em] tabular">{Math.round(a.coveragePct)}%</td>
                  <td className="px-3 py-3.5 text-right text-ink-2 tabular">{a.longestBlackoutH ? fmtHours(a.longestBlackoutH) : 'None'}</td>
                  <td className="px-3 py-3.5 text-right">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-bold ${vPill[a.verdict]}`}>{a.verdict}</span>
                    {slipped && (
                      <div className="mt-1 text-[11px] text-ink-3">
                        {mission.slipDays} d late: <span className="font-semibold">{slipped.verdict}</span>
                      </div>
                    )}
                  </td>
                  <td className="rounded-r-[10px] py-3.5 pr-2">
                    <RowMenu site={site} isMine={active} canRemove={(ids?.length ?? rows.length) > 1} onSelect={() => onSelect(site.id)} onRemove={() => onRemove(site.id)} />
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// One plain line per site under its name: why it is on the list.
const NOTES: Record<string, string> = {
  'malapert': 'Artemis III candidate',
  'nobile-rim-2': 'Artemis III candidate',
  'shackleton-ce7': "Chang'e-7 target",
  'shackleton-ridge': 'The sunniest site here',
  'mons-mouton': 'IM-2 Athena landed here',
  'haworth': 'Next to ice, little light',
  'chandrayaan-3': "India's 2023 landing site",
  'apollo-11': 'First crewed landing, 1969',
  'change-4': 'First far side landing, 2019',
}
const shortNote = (site: Site) => NOTES[site.id] ?? site.role
