import { motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  askFive,
  askFiveAudio,
  canListen,
  canSpeak,
  speakFive,
  startVoiceRecorder,
  type FiveTurn,
  type VoiceRecorderHandle,
} from '../lib/five'
import Five, { type FiveMode } from './Five'

const STARTERS = [
  'Which landing site gets the most sunlight?',
  'What does the Slip Test show?',
  'Who built Gnomon and how was it validated?',
]

const EQUALIZER_WEIGHTS = [0.5, 0.9, 1, 0.85, 0.5]
const NOOP_AUDIO_SEND = async () => {}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}

/**
 * Floating voice + text dialog for Five.
 * Controls live strictly on the bottom-right side of the chatbar, matching Gemini chat UX.
 */
export default function AskFive({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const [turns, setTurns] = useState<FiveTurn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [listenSeconds, setListenSeconds] = useState(0)
  const [preparingSpeech, setPreparingSpeech] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [audioEnergy, setAudioEnergy] = useState(0)
  const [voiceOut, setVoiceOut] = useState(true)
  const [note, setNote] = useState<string | null>(null)

  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const recorderRef = useRef<VoiceRecorderHandle | null>(null)
  const stopSpeakRef = useRef<() => void>(() => {})
  const abortRef = useRef<AbortController | null>(null)
  const interactionIdRef = useRef<string | undefined>(undefined)
  const requestSeqRef = useRef(0)
  const listenDurationRef = useRef(0)

  const openRef = useRef(open)
  const voiceOutRef = useRef(voiceOut)
  const busyRef = useRef(busy)

  useEffect(() => {
    openRef.current = open
    voiceOutRef.current = voiceOut
    busyRef.current = busy
  }, [open, voiceOut, busy])

  useEffect(() => {
    if (!listening) return
    const id = window.setInterval(() => {
      listenDurationRef.current += 1
      setListenSeconds((s) => s + 1)
    }, 1000)
    return () => window.clearInterval(id)
  }, [listening])

  const stopSpeech = useCallback(() => {
    stopSpeakRef.current()
    stopSpeakRef.current = () => {}
    setPreparingSpeech(false)
    setSpeaking(false)
    setAudioEnergy(0)
  }, [])

  const cancelVoiceInput = useCallback(() => {
    recorderRef.current?.cancel()
    recorderRef.current = null
    setListening(false)
    setListenSeconds(0)
    listenDurationRef.current = 0
    setAudioEnergy(0)
  }, [])

  const stopResponse = useCallback(() => {
    requestSeqRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    stopSpeech()
  }, [stopSpeech])

  const closeSession = useCallback(() => {
    requestSeqRef.current += 1
    cancelVoiceInput()
    stopSpeech()
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setDraft('')
    setNote(null)
    onClose()
  }, [cancelVoiceInput, onClose, stopSpeech])

  // Synchronize native <dialog>.showModal() / .close() with `open`.
  useEffect(() => {
    const dlg = dialogRef.current
    if (!dlg) return
    if (open) {
      if (!dlg.open) dlg.showModal()
      const t = window.setTimeout(() => inputRef.current?.focus(), 40)
      return () => window.clearTimeout(t)
    }
    if (dlg.open) dlg.close()
  }, [open])

  // Clean up hardware mic/audio/requests if closed externally or unmounted.
  useEffect(() => {
    if (open) return
    requestSeqRef.current += 1
    recorderRef.current?.cancel()
    recorderRef.current = null
    stopSpeakRef.current()
    stopSpeakRef.current = () => {}
    abortRef.current?.abort()
    abortRef.current = null
  }, [open])

  useEffect(
    () => () => {
      recorderRef.current?.cancel()
      stopSpeakRef.current()
      abortRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [turns, busy, reduce])

  const speakReply = useCallback(
    (text: string) => {
      stopSpeech()
      if (!voiceOutRef.current || !canSpeak()) return
      setPreparingSpeech(true)
      stopSpeakRef.current = speakFive(text, {
        onStart: () => {
          setPreparingSpeech(false)
          setSpeaking(true)
        },
        onEnergy: (level) => setAudioEnergy(level),
        onEnd: () => {
          stopSpeakRef.current = () => {}
          setPreparingSpeech(false)
          setSpeaking(false)
          setAudioEnergy(0)
        },
      })
    },
    [stopSpeech],
  )

  const sendText = useCallback(
    async (text: string) => {
      const q = text.trim()
      if (!q || busyRef.current) return
      setNote(null)
      setDraft('')
      cancelVoiceInput()
      stopSpeech()

      const prevTurns = turns
      setTurns([...prevTurns, { role: 'user', text: q }])
      setBusy(true)
      const seq = ++requestSeqRef.current
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await askFive(q, prevTurns, {
          previousInteractionId: interactionIdRef.current,
          signal: controller.signal,
        })
        if (seq !== requestSeqRef.current) return
        if (res.interactionId) interactionIdRef.current = res.interactionId
        setTurns((cur) => [...cur, { role: 'five', text: res.answer }])
        setBusy(false)
        speakReply(res.answer)
      } catch (err) {
        if ((err as Error).name === 'AbortError' || seq !== requestSeqRef.current) return
        setNote('Five couldn’t answer just now. Try asking again.')
      } finally {
        if (seq === requestSeqRef.current) setBusy(false)
      }
    },
    [cancelVoiceInput, speakReply, stopSpeech, turns],
  )

  const sendAudio = useCallback(
    async (audioBlob: Blob, durationSec: number) => {
      if (busyRef.current) return
      if (audioBlob.size < 256) {
        setNote('Hold the mic briefly while speaking, then tap send.')
        return
      }
      setNote(null)
      stopSpeech()

      const label = durationSec > 0 ? `Voice message (${formatSeconds(durationSec)})` : 'Voice message'
      const prevTurns = turns
      setTurns([...prevTurns, { role: 'user', text: label }])
      setBusy(true)
      const seq = ++requestSeqRef.current
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await askFiveAudio(audioBlob, prevTurns, {
          previousInteractionId: interactionIdRef.current,
          signal: controller.signal,
        })
        if (seq !== requestSeqRef.current) return
        if (res.interactionId) interactionIdRef.current = res.interactionId
        setTurns((cur) => [...cur, { role: 'five', text: res.answer }])
        setBusy(false)
        speakReply(res.answer)
      } catch (err) {
        if ((err as Error).name === 'AbortError' || seq !== requestSeqRef.current) return
        console.warn('Voice request failed:', err)
        setNote('Five couldn’t process that voice message. Try again or type below.')
      } finally {
        if (seq === requestSeqRef.current) setBusy(false)
      }
    },
    [speakReply, stopSpeech, turns],
  )

  const sendAudioRef = useRef<(audio: Blob, durationSec: number) => Promise<void>>(NOOP_AUDIO_SEND)
  useEffect(() => {
    sendAudioRef.current = sendAudio
  }, [sendAudio])

  const beginVoiceInput = () => {
    if (!canListen()) {
      setNote('Microphone recording isn’t available in this browser — type below anytime.')
      return
    }
    setNote(null)
    stopSpeech()
    recorderRef.current?.cancel()
    listenDurationRef.current = 0
    setListenSeconds(0)
    setListening(true)

    recorderRef.current = startVoiceRecorder({
      onReady: () => {
        listenDurationRef.current = 0
        setListenSeconds(0)
      },
      onEnergy: (level) => setAudioEnergy(level),
      onStop: (blob) => {
        const secs = listenDurationRef.current
        recorderRef.current = null
        setListening(false)
        setListenSeconds(0)
        listenDurationRef.current = 0
        setAudioEnergy(0)
        void sendAudioRef.current(blob, secs)
      },
      onError: (msg) => {
        recorderRef.current = null
        setListening(false)
        setListenSeconds(0)
        listenDurationRef.current = 0
        setAudioEnergy(0)
        setNote(msg)
      },
    })
  }

  const finishVoiceAndSend = () => {
    recorderRef.current?.stop()
  }

  const toggleMute = () => {
    const next = !voiceOut
    setVoiceOut(next)
    voiceOutRef.current = next
    if (!next) stopSpeech()
  }

  // Light-dismiss fallback when `closedby="any"` is unsupported (e.g. Safari).
  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if ('closedBy' in HTMLDialogElement.prototype) return
    const dlg = dialogRef.current
    if (!dlg || e.target !== dlg) return
    if (e.clientX === 0 && e.clientY === 0) return
    const rect = dlg.getBoundingClientRect()
    const inside =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    if (!inside) closeSession()
  }

  const responding = busy || preparingSpeech || speaking

  const mode: FiveMode = listening
    ? 'listen'
    : busy || preparingSpeech
      ? 'think'
      : speaking
        ? 'speak'
        : 'idle'

  const statusText = listening
    ? 'Listening… speak now'
    : busy
      ? 'Thinking…'
      : preparingSpeech
        ? 'Preparing voice…'
        : speaking
          ? 'Speaking…'
          : 'Ask about the Moon, sites, or Gnomon'

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="ask-five-title"
      data-lenis-prevent
      onClick={handleDialogClick}
      onClose={() => {
        if (openRef.current) closeSession()
      }}
      className="lnd-five-dialog w-[min(520px,calc(100vw-20px))] max-h-[min(720px,calc(100svh-24px))]"
    >
      <div className="flex max-h-[min(720px,calc(100svh-24px))] w-full flex-col overflow-hidden rounded-[28px] bg-[var(--card)] text-[var(--ink)] shadow-[0_0_0_1px_var(--line),0_32px_90px_-28px_rgb(0_0_0/0.6)]">
        {/* Clean modal header (close button only) */}
        <header className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3.5">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-200 ${
              listening || speaking
                ? 'bg-[var(--sun)] shadow-[0_0_0_4px_rgb(210_80_42/0.18)]'
                : busy || preparingSpeech
                  ? 'bg-[var(--ink)]'
                  : 'bg-[var(--ink-2)]/40'
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h2 id="ask-five-title" className="brand text-[21px] leading-none tracking-[-0.02em]">
                Five
              </h2>
              <span className="text-[12px] font-semibold tracking-[-0.01em] text-[var(--ink-2)]">
                Gnomon Guide
              </span>
            </div>
            <p className="mt-0.5 truncate text-[12.5px] font-medium text-[var(--ink-2)]">
              {statusText}
            </p>
          </div>

          <button
            type="button"
            onClick={closeSession}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full text-[var(--ink-2)] transition-colors duration-150 hover:bg-[var(--card-2)] hover:text-[var(--ink)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        {/* Clean animated Five stage (no top buttons) */}
        <div className="relative flex flex-col items-center justify-center overflow-hidden border-b border-[var(--line)] bg-[var(--sand)] px-5 py-5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                mode === 'speak' || mode === 'listen'
                  ? 'radial-gradient(circle at 50% 50%, rgb(210 80 42 / 0.14), transparent 64%)'
                  : 'radial-gradient(circle at 50% 50%, rgb(210 80 42 / 0.05), transparent 60%)',
            }}
          />

          <div className="relative flex items-center justify-center">
            {!reduce && (speaking || listening) && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute rounded-full border border-[var(--sun)]/35"
                animate={{
                  width: 118 + audioEnergy * 54,
                  height: 118 + audioEnergy * 54,
                  opacity: 0.25 + audioEnergy * 0.55,
                }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
              />
            )}
            <Five
              key={open ? 'open' : 'closed'}
              draw={open}
              mode={mode}
              energy={audioEnergy}
              size={104}
              title="Five"
            />
          </div>
        </div>

        {/* Scrollable chat transcript */}
        <div ref={listRef} className="min-h-[180px] flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
          {!turns.length && (
            <div className="space-y-3">
              <p className="max-w-[90%] rounded-[18px] rounded-tl-[6px] bg-[var(--card-2)] px-4 py-3 text-[14.5px] font-medium leading-snug">
                Hi, I’m Five — Gnomon’s Moon guide. Ask me by voice or type a question below.
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void sendText(s)}
                    className="rounded-full px-3.5 py-2 text-left text-[12.5px] font-semibold tracking-[-0.01em] text-[var(--ink-2)] shadow-[inset_0_0_0_1px_var(--line)] transition-colors duration-150 hover:bg-[var(--card-2)] hover:text-[var(--ink)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'}`}>
              <p
                className={`max-w-[88%] whitespace-pre-line px-4 py-3 text-[14.5px] font-medium leading-snug ${
                  t.role === 'user'
                    ? 'rounded-[18px] rounded-tr-[6px] bg-[var(--ink)] text-[var(--on-ink)]'
                    : 'rounded-[18px] rounded-tl-[6px] bg-[var(--card-2)] text-[var(--ink)]'
                }`}
              >
                {t.text}
              </p>
            </div>
          ))}

          {busy && (
            <p className="inline-flex items-center gap-1.5 rounded-[18px] rounded-tl-[6px] bg-[var(--card-2)] px-4 py-3.5" aria-label="Five is thinking">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="lnd-typing h-1.5 w-1.5 rounded-full bg-[var(--ink-2)]"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </p>
          )}
        </div>

        {note && (
          <p className="px-5 pb-1.5 text-[12.5px] font-semibold text-[var(--sun-ink)]" role="status">
            {note}
          </p>
        )}

        {/* Chatbar with all voice/send/stop controls on the bottom-right */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (listening) {
              finishVoiceAndSend()
              return
            }
            void sendText(draft)
          }}
          className="flex items-center gap-2 border-t border-[var(--line)] p-3"
        >
          {listening ? (
            <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-[var(--card-2)] px-4">
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[var(--sun)]" aria-hidden />
              <span className="truncate text-[14px] font-semibold text-[var(--ink)]">
                Listening… {formatSeconds(listenSeconds)}
              </span>
              <span className="ml-auto inline-flex h-4 items-center gap-0.5 text-[var(--sun)]" aria-hidden>
                {EQUALIZER_WEIGHTS.map((w, idx) => (
                  <span
                    key={idx}
                    className="w-0.5 rounded-full bg-current transition-[height] duration-75"
                    style={{ height: `${Math.max(4, Math.round((0.25 + audioEnergy * 0.75) * w * 14))}px` }}
                  />
                ))}
              </span>
            </div>
          ) : (
            <input
              ref={inputRef}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask Five…"
              aria-label="Your question"
              maxLength={500}
              className="h-11 min-w-0 flex-1 rounded-full bg-[var(--card-2)] px-4 text-[14.5px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--ink-2)] focus-visible:shadow-[0_0_0_2px_var(--sun)]"
            />
          )}

          {/* Bottom-right controls */}
          <div className="flex shrink-0 items-center gap-1.5">
            {listening ? (
              <>
                <button
                  type="button"
                  onClick={cancelVoiceInput}
                  aria-label="Cancel voice recording"
                  title="Cancel recording"
                  className="grid h-10 w-10 place-items-center rounded-full bg-[var(--card-2)] text-[var(--ink-2)] transition-colors duration-150 hover:bg-[var(--line)] hover:text-[var(--ink)]"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={finishVoiceAndSend}
                  aria-label="Send voice message"
                  title="Stop & send voice"
                  className="grid h-11 w-11 place-items-center rounded-full bg-[var(--sun)] text-[var(--cream)] shadow-[0_6px_18px_-6px_rgb(210_80_42/0.55)] transition-transform duration-150 active:scale-[0.95]"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                {canSpeak() && (
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-pressed={voiceOut}
                    aria-label={voiceOut ? 'Mute voice replies' : 'Unmute voice replies'}
                    title={voiceOut ? 'Voice replies on' : 'Voice replies muted'}
                    className={`grid h-10 w-10 place-items-center rounded-full transition-colors duration-150 ${
                      voiceOut
                        ? 'bg-[var(--card-2)] text-[var(--ink)] hover:bg-[var(--line)]'
                        : 'text-[var(--ink-2)] hover:bg-[var(--card-2)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M11 5L6 9H3v6h3l5 4V5z" />
                      {voiceOut ? (
                        <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
                      ) : (
                        <path d="M16 9l5 6M21 9l-5 6" />
                      )}
                    </svg>
                  </button>
                )}

                <button
                  type="button"
                  onClick={beginVoiceInput}
                  disabled={!canListen() || busy}
                  aria-label="Voice input"
                  title={canListen() ? 'Speak to Five' : 'Voice input isn’t supported in this browser'}
                  className="grid h-10 w-10 place-items-center rounded-full bg-[var(--card-2)] text-[var(--ink)] transition-colors duration-150 hover:bg-[var(--line)] disabled:opacity-40"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0014 0M12 18v3" />
                  </svg>
                </button>

                {responding ? (
                  <button
                    type="button"
                    onClick={stopResponse}
                    aria-label="Stop"
                    title="Stop"
                    className="grid h-11 w-11 place-items-center rounded-full bg-[var(--ink)] text-[var(--on-ink)] transition-transform duration-150 active:scale-[0.95]"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                      <rect x="2.5" y="2.5" width="9" height="9" rx="2" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    aria-label="Send"
                    className="grid h-11 w-11 place-items-center rounded-full bg-[var(--ink)] text-[var(--on-ink)] transition-[transform,opacity] duration-150 active:scale-[0.95] disabled:opacity-30"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </dialog>
  )
}
