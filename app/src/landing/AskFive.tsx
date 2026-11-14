import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { askFive, canListen, canSpeak, FIVE_API_READY, speak, startListening, type FiveTurn } from '../lib/five'
import Five, { type FiveMode } from './Five'

const EASE = [0.23, 1, 0.32, 1] as const
const STARTERS = ['Why is the south pole so hard to land on?', 'Which site gets the most sunlight?', 'What does the Slip Test show?']

/**
 * "Ask Five" window: type or speak a question, Five answers (lib/five.ts holds the API hook).
 * Esc or the backdrop closes it; focus returns to the button that opened it.
 */
export default function AskFive({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion()
  const [turns, setTurns] = useState<FiveTurn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [readAloud, setReadAloud] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const stopListen = useRef<() => void>(() => {})
  const stopSpeak = useRef<() => void>(() => {})
  const abort = useRef<AbortController | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  // Focus the input on open; Esc closes; Tab stays inside the window.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => input.current?.focus(), 60)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !panel.current) return
      const f = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, [href]'))
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  // Stop voice and requests when the window closes.
  useEffect(() => {
    if (open) return
    stopListen.current(); stopSpeak.current(); abort.current?.abort()
    setListening(false); setSpeaking(false); setBusy(false)
  }, [open])

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' }) }, [turns, busy, reduce])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setNote(null)
    setDraft('')
    const history = [...turns, { role: 'user' as const, text: q }]
    setTurns(history)
    setBusy(true)
    abort.current = new AbortController()
    try {
      const answer = await askFive(q, turns, abort.current.signal)
      setTurns((h) => [...h, { role: 'five', text: answer }])
      if (readAloud) { setSpeaking(true); stopSpeak.current = speak(answer, () => setSpeaking(false)) }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setNote('Five couldn’t answer just now. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  const toggleMic = () => {
    if (listening) { stopListen.current(); return }
    setNote(null)
    stopSpeak.current()
    setListening(true)
    stopListen.current = startListening({
      onText: (t) => setDraft(t),
      onDone: (t) => { setListening(false); if (t) void send(t) },
      onError: (msg) => { setListening(false); setNote(msg) },
    })
  }

  const mode: FiveMode = listening ? 'listen' : busy || speaking ? 'speak' : 'idle'

  // Render at the landing page root (inside .lnd so its colours apply), outside the animated nav.
  if (typeof document === 'undefined') return null
  const host = document.querySelector('.lnd') ?? document.body
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="five-host fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
        >
          <button type="button" aria-label="Close Ask Five" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-[rgb(7_9_13/0.45)] backdrop-blur-[2px]" />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ask-five-title"
            data-lenis-prevent
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="relative flex max-h-[min(640px,calc(100svh-24px))] w-full max-w-[460px] flex-col overflow-hidden rounded-[28px] bg-[var(--card)] text-[var(--ink)] shadow-[0_0_0_1px_var(--line),0_30px_80px_-30px_rgb(0_0_0/0.55)]"
          >
            <header className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
              <Five mode={mode} size={34} title="Five" />
              <div className="min-w-0 flex-1">
                <h2 id="ask-five-title" className="text-[17px] font-semibold tracking-[-0.025em]">Ask Five</h2>
                <p className="text-[12.5px] font-medium text-[var(--ink-2)]">
                  {listening ? 'Listening…' : busy ? 'Thinking…' : speaking ? 'Speaking…' : 'About the Moon’s light, the sites, or the app'}
                </p>
              </div>
              {canSpeak() && (
                <button
                  type="button"
                  onClick={() => { const n = !readAloud; setReadAloud(n); if (!n) stopSpeak.current() }}
                  aria-pressed={readAloud}
                  aria-label={readAloud ? 'Stop reading answers aloud' : 'Read answers aloud'}
                  title={readAloud ? 'Answers are read aloud' : 'Read answers aloud'}
                  className={`grid h-10 w-10 place-items-center rounded-full transition-colors duration-150 ${readAloud ? 'bg-[var(--ink)] text-[var(--on-ink)]' : 'text-[var(--ink-2)] hover:bg-[var(--card-2)] hover:text-[var(--ink)]'}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M11 5L6 9H3v6h3l5 4V5z" />
                    {readAloud ? <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" /> : <path d="M16 9l5 6M21 9l-5 6" />}
                  </svg>
                </button>
              )}
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-[var(--ink-2)] transition-colors duration-150 hover:bg-[var(--card-2)] hover:text-[var(--ink)]">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </header>

            <div ref={list} className="min-h-[220px] flex-1 space-y-3 overflow-y-auto px-5 py-5" aria-live="polite">
              <p className="max-w-[85%] rounded-[18px] rounded-tl-[6px] bg-[var(--card-2)] px-4 py-3 text-[14.5px] font-medium leading-snug">
                Hi, I’m Five. Ask me why landing near the south pole is hard, which site gets the most light, or how to read a verdict.
              </p>
              {turns.map((t, i) => (
                <p
                  key={i}
                  className={`max-w-[85%] px-4 py-3 text-[14.5px] font-medium leading-snug ${t.role === 'user' ? 'ml-auto rounded-[18px] rounded-tr-[6px] bg-[var(--ink)] text-[var(--on-ink)]' : 'rounded-[18px] rounded-tl-[6px] bg-[var(--card-2)]'}`}
                >
                  {t.text}
                </p>
              ))}
              {busy && (
                <p className="inline-flex items-center gap-1.5 rounded-[18px] rounded-tl-[6px] bg-[var(--card-2)] px-4 py-3.5" aria-label="Five is thinking">
                  {[0, 1, 2].map((i) => <span key={i} className="lnd-typing h-1.5 w-1.5 rounded-full bg-[var(--ink-2)]" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </p>
              )}
              {!turns.length && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => void send(s)} className="rounded-full px-3.5 py-2 text-left text-[13px] font-semibold tracking-[-0.01em] text-[var(--ink-2)] shadow-[inset_0_0_0_1px_var(--line)] transition-colors duration-150 hover:bg-[var(--card-2)] hover:text-[var(--ink)]">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {note && <p className="px-5 pb-2 text-[12.5px] font-semibold text-[var(--sun-ink)]" role="status">{note}</p>}
            <form onSubmit={(e) => { e.preventDefault(); void send(draft) }} className="flex items-center gap-2 border-t border-[var(--line)] p-3">
              <input
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={listening ? 'Listening…' : 'Ask Five a question'}
                aria-label="Your question"
                maxLength={500}
                className="h-11 min-w-0 flex-1 rounded-full bg-[var(--card-2)] px-4 text-[15px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--ink-2)] focus-visible:shadow-[0_0_0_2px_var(--sun)]"
              />
              <button
                type="button"
                onClick={toggleMic}
                disabled={!canListen() || busy}
                aria-pressed={listening}
                aria-label={listening ? 'Stop listening' : 'Ask by voice'}
                title={canListen() ? (listening ? 'Stop listening' : 'Ask by voice') : 'Voice input isn’t available in this browser'}
                className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors duration-150 disabled:opacity-40 ${listening ? 'bg-[var(--sun)] text-[var(--cream)]' : 'bg-[var(--card-2)] text-[var(--ink)] hover:bg-[var(--line)]'}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0014 0M12 18v3" />
                </svg>
              </button>
              <button
                type="submit"
                disabled={!draft.trim() || busy}
                aria-label="Send"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[var(--on-ink)] transition-[transform,opacity] duration-150 active:scale-[0.95] disabled:opacity-30"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" /></svg>
              </button>
            </form>
            {!FIVE_API_READY && <p className="-mt-1 px-5 pb-3 text-[11.5px] font-medium text-[var(--ink-2)]">Preview: Five’s answers aren’t connected yet.</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    host,
  )
}
