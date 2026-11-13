import { useEffect, useId, useRef, useState } from 'react'
import { isOriginal } from '../lib/compare'
import { clampIdx, dateToIdx, fmtDate, fmtHours, idxToDate } from '../lib/engine'
import { cleanName, MAX_NAME, type SavedMission } from '../lib/missions'
import type { Dataset } from '../lib/types'

export interface NewMissionInput {
  name: string
  siteId: string
  startIdx: number
  durationH: number
  needComms: boolean
}

const toInput = (d: Date) => d.toISOString().slice(0, 16)

const field = 'w-full rounded-[8px] bg-surface px-3 py-2 text-[13px] text-ink shadow-control outline-none transition-shadow duration-150 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_35%,transparent)]'

/**
 * "New mission": name a mission, pick its site and dates, and open it on the dashboard.
 * Also lists missions saved in this browser so they can be reopened or removed.
 */
export default function NewMission({ open, onClose, ds, defaults, missions, onCreate, onOpen, onRemove }: {
  open: boolean
  onClose: () => void
  ds: Dataset
  defaults: Omit<NewMissionInput, 'name'>
  missions: SavedMission[]
  onCreate: (m: NewMissionInput) => void
  onOpen: (m: SavedMission) => void
  onRemove: (id: string) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const [name, setName] = useState('')
  const [siteId, setSiteId] = useState(defaults.siteId)
  const [landing, setLanding] = useState(toInput(idxToDate(ds, defaults.startIdx)))
  const [days, setDays] = useState(Math.round(defaults.durationH / 24))
  const [needComms, setNeedComms] = useState(defaults.needComms)
  const [tried, setTried] = useState(false)

  // Open/close the native dialog, and start each new mission from the current plan.
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setName('')
      setSiteId(defaults.siteId)
      setLanding(toInput(idxToDate(ds, defaults.startIdx)))
      setDays(Math.round(defaults.durationH / 24))
      setNeedComms(defaults.needComms)
      setTried(false)
      d.showModal()
    } else if (!open && d.open) d.close()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- reset only when opening

  const clean = cleanName(name)
  const min = toInput(idxToDate(ds, 0))
  const max = toInput(idxToDate(ds, ds.meta.count - 1))
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!clean) return
    const t = Date.parse(landing + ':00Z')
    const startIdx = clampIdx(ds, Number.isNaN(t) ? defaults.startIdx : dateToIdx(ds, new Date(t)))
    onCreate({ name: clean, siteId, startIdx, durationH: Math.min(28, Math.max(1, days)) * 24, needComms })
  }
  const siteName = (sid: string) => ds.sites.find((s) => s.id === sid)?.name ?? sid
  const original = ds.sites.filter(isOriginal)
  const more = ds.sites.filter((s) => !isOriginal(s))

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      aria-labelledby={id + '-title'}
      className="m-auto w-[min(460px,calc(100vw-32px))] rounded-[14px] bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
    >
      <form onSubmit={submit} className="p-5" noValidate>
        <h2 id={id + '-title'} className="font-display text-lg font-semibold">New mission</h2>
        <p className="mt-1 text-sm text-ink-2">Name it, pick where and when it lands, and Rocky opens it on the dashboard.</p>

        <label className="mt-4 block text-[13px] font-medium" htmlFor={id + '-name'}>Mission name</label>
        <input
          id={id + '-name'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME + 10}
          placeholder="e.g. Bayanihan-1"
          autoComplete="off"
          aria-invalid={tried && !clean}
          aria-describedby={tried && !clean ? id + '-err' : undefined}
          className={`mt-1.5 ${field}`}
          autoFocus
        />
        {tried && !clean && <p id={id + '-err'} className="mt-1 text-xs text-nogo-ink">Give the mission a name.</p>}

        <label className="mt-3 block text-[13px] font-medium" htmlFor={id + '-site'}>Landing site</label>
        <select id={id + '-site'} value={siteId} onChange={(e) => setSiteId(e.target.value)} className={`mt-1.5 ${field}`}>
          <optgroup label="Original sites">
            {original.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
          {more.length > 0 && (
            <optgroup label="More sites">
              {more.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          )}
        </select>

        <div className="mt-3 grid grid-cols-[1fr_7rem] gap-3">
          <div>
            <label className="block text-[13px] font-medium" htmlFor={id + '-landing'}>Landing (UTC)</label>
            <input id={id + '-landing'} type="datetime-local" value={landing} min={min} max={max} onChange={(e) => e.target.value && setLanding(e.target.value)} className={`mt-1.5 tabular ${field}`} />
          </div>
          <div>
            <label className="block text-[13px] font-medium" htmlFor={id + '-days'}>Length (days)</label>
            <input id={id + '-days'} type="number" min={1} max={28} value={days} onChange={(e) => setDays(Math.min(28, Math.max(1, Math.round(+e.target.value || 1))))} className={`mt-1.5 tabular ${field}`} />
          </div>
        </div>

        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 shadow-control">
          <span className="text-[13px]">Needs direct-to-Earth comms</span>
          <input type="checkbox" checked={needComms} onChange={(e) => setNeedComms(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink">Cancel</button>
          <button type="submit" className="h-9 rounded-lg bg-accent px-4 text-[13px] font-medium text-white shadow-control transition-transform duration-100 active:scale-[0.97]">Create mission</button>
        </div>
      </form>

      {missions.length > 0 && (
        <section className="border-t border-line px-5 pb-5 pt-4" aria-label="Your missions">
          <h3 className="text-[13px] font-semibold">Your missions</h3>
          <p className="mt-0.5 text-xs text-ink-3">Saved in this browser. Changes you make to an open mission are saved as you go.</p>
          <ul className="mt-2 flex max-h-56 flex-col overflow-y-auto">
            {missions.map((m) => {
              const t = Date.parse(m.landing)
              return (
                <li key={m.id} className="flex items-center gap-2 border-t border-line py-2 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{m.name}</div>
                    <div className="truncate text-xs text-ink-3 tabular">
                      {siteName(m.siteId)} · {Number.isNaN(t) ? '—' : fmtDate(new Date(t))} · {fmtHours(m.durationH)}
                    </div>
                  </div>
                  <button type="button" onClick={() => onOpen(m)} className="h-8 rounded-md px-2.5 text-xs font-medium text-ink ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-surface-2">Open</button>
                  <button type="button" onClick={() => onRemove(m.id)} aria-label={`Remove ${m.name}`} title="Remove from this browser" className="grid h-8 w-8 place-items-center rounded-md text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-nogo-ink">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M2 2l8 8M10 2L2 10" /></svg>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </dialog>
  )
}
