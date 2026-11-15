import { motion, useReducedMotion } from 'framer-motion'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ToggleEvent as ReactToggleEvent,
} from 'react'
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

export type AskFivePresentation = 'modal' | 'window'

type WindowRect = { left: number; top: number; width: number; height: number }
type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type WindowGesture = {
  kind: 'drag' | ResizeEdge
  pointerId: number
  startX: number
  startY: number
  startRect: WindowRect
}

const STARTERS = [
  'Which landing site gets the most sunlight?',
  'What does the Slip Test show?',
  'Who built Gnomon and how was it validated?',
]

const EQUALIZER_WEIGHTS = [0.5, 0.9, 1, 0.85, 0.5]
const NOOP_AUDIO_SEND = async () => {}

const WINDOW_MARGIN = 8
const WINDOW_MIN_W = 320
const WINDOW_MIN_H = 380
const WINDOW_DEFAULT_W = 410
const WINDOW_DEFAULT_H = 560
const KEYBOARD_STEP = 24
const KEYBOARD_FAST_STEP = 64

const RESIZE_EDGES: ReadonlyArray<{ edge: ResizeEdge; label: string; className: string }> = [
  { edge: 'n', label: 'Top edge', className: 'inset-x-4 top-0 h-2 cursor-ns-resize' },
  { edge: 's', label: 'Bottom edge', className: 'left-4 right-6 bottom-0 h-2 cursor-ns-resize' },
  { edge: 'w', label: 'Left edge', className: 'inset-y-4 left-0 w-2 cursor-ew-resize' },
  { edge: 'e', label: 'Right edge', className: 'top-4 bottom-6 right-0 w-2 cursor-ew-resize' },
  { edge: 'nw', label: 'Top-left corner', className: 'top-0 left-0 h-3.5 w-3.5 cursor-nwse-resize' },
  { edge: 'ne', label: 'Top-right corner', className: 'top-0 right-0 h-3 w-3 cursor-nesw-resize' },
  { edge: 'sw', label: 'Bottom-left corner', className: 'bottom-0 left-0 h-3.5 w-3.5 cursor-nesw-resize' },
]

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

function getViewport(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 1280, h: 800 }
  return { w: window.innerWidth, h: window.innerHeight }
}

function clampWindowRect(rect: WindowRect, vw: number, vh: number): WindowRect {
  const safeVw = Math.max(vw, 240)
  const safeVh = Math.max(vh, 280)
  const maxW = Math.max(220, safeVw - WINDOW_MARGIN * 2)
  const maxH = Math.max(260, safeVh - WINDOW_MARGIN * 2)
  const minW = Math.min(WINDOW_MIN_W, maxW)
  const minH = Math.min(WINDOW_MIN_H, maxH)
  const width = Math.round(clamp(rect.width, minW, maxW))
  const height = Math.round(clamp(rect.height, minH, maxH))
  const maxLeft = Math.max(WINDOW_MARGIN, safeVw - width - WINDOW_MARGIN)
  const maxTop = Math.max(WINDOW_MARGIN, safeVh - height - WINDOW_MARGIN)
  const left = Math.round(clamp(rect.left, WINDOW_MARGIN, maxLeft))
  const top = Math.round(clamp(rect.top, WINDOW_MARGIN, maxTop))
  return { left, top, width, height }
}

function defaultWindowRect(vw: number, vh: number): WindowRect {
  return clampWindowRect(
    {
      left: vw - WINDOW_DEFAULT_W - 20,
      top: vh - WINDOW_DEFAULT_H - 20,
      width: WINDOW_DEFAULT_W,
      height: WINDOW_DEFAULT_H,
    },
    vw,
    vh,
  )
}

function resizeWindowRect(
  start: WindowRect,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  vw: number,
  vh: number,
): WindowRect {
  const safeVw = Math.max(vw, 240)
  const safeVh = Math.max(vh, 280)
  const minW = Math.min(WINDOW_MIN_W, Math.max(220, safeVw - WINDOW_MARGIN * 2))
  const minH = Math.min(WINDOW_MIN_H, Math.max(260, safeVh - WINDOW_MARGIN * 2))

  let { left, top, width, height } = start

  if (edge.includes('e')) {
    const maxEastW = Math.max(minW, safeVw - start.left - WINDOW_MARGIN)
    width = clamp(start.width + dx, minW, maxEastW)
  } else if (edge.includes('w')) {
    const maxWestW = Math.max(minW, start.left + start.width - WINDOW_MARGIN)
    width = clamp(start.width - dx, minW, maxWestW)
    left = start.left + start.width - width
  }

  if (edge.includes('s')) {
    const maxSouthH = Math.max(minH, safeVh - start.top - WINDOW_MARGIN)
    height = clamp(start.height + dy, minH, maxSouthH)
  } else if (edge.includes('n')) {
    const maxNorthH = Math.max(minH, start.top + start.height - WINDOW_MARGIN)
    height = clamp(start.height - dy, minH, maxNorthH)
    top = start.top + start.height - height
  }

  return clampWindowRect({ left, top, width, height }, safeVw, safeVh)
}

function arrowDelta(e: ReactKeyboardEvent<HTMLElement>): { dx: number; dy: number } | null {
  const step = e.shiftKey ? KEYBOARD_FAST_STEP : KEYBOARD_STEP
  switch (e.key) {
    case 'ArrowLeft':
      return { dx: -step, dy: 0 }
    case 'ArrowRight':
      return { dx: step, dy: 0 }
    case 'ArrowUp':
      return { dx: 0, dy: -step }
    case 'ArrowDown':
      return { dx: 0, dy: step }
    default:
      return null
  }
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}

/**
 * Voice + text dialog for Five.
 * Renders as a centered modal on the landing page, or a draggable/resizable floating window in the dashboard.
 */
export default function AskFive({
  open,
  onClose,
  mode = 'modal',
}: {
  open: boolean
  onClose: () => void
  mode?: AskFivePresentation
}) {
  const reduce = useReducedMotion()
  const isWindow = mode === 'window'
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
  const [viewport, setViewport] = useState(getViewport)
  const [customRect, setCustomRect] = useState<WindowRect | null>(null)
  const [dragging, setDragging] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const recorderRef = useRef<VoiceRecorderHandle | null>(null)
  const stopSpeakRef = useRef<() => void>(() => {})
  const abortRef = useRef<AbortController | null>(null)
  const interactionIdRef = useRef<string | undefined>(undefined)
  const requestSeqRef = useRef(0)
  const listenDurationRef = useRef(0)
  const gestureRef = useRef<WindowGesture | null>(null)

  const openRef = useRef(open)
  const voiceOutRef = useRef(voiceOut)
  const busyRef = useRef(busy)

  const currentRect = customRect
    ? clampWindowRect(customRect, viewport.w, viewport.h)
    : defaultWindowRect(viewport.w, viewport.h)

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
    gestureRef.current = null
    setDragging(false)
    cancelVoiceInput()
    stopSpeech()
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setDraft('')
    setNote(null)
    onClose()
  }, [cancelVoiceInput, onClose, stopSpeech])

  useEffect(() => {
    if (!isWindow) return
    const onResize = () => setViewport(getViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isWindow])

  // Synchronize native <dialog> (modal or non-modal manual popover window) with `open`.
  useEffect(() => {
    const dlg = dialogRef.current
    if (!dlg) return

    if (isWindow) {
      const supportsPopover =
        typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover')
      if (open) {
        if (supportsPopover) {
          if (dlg.isConnected && !dlg.matches(':popover-open')) dlg.showPopover()
        } else if (!dlg.open) {
          dlg.show()
        }
        const t = window.setTimeout(() => inputRef.current?.focus(), 40)
        return () => window.clearTimeout(t)
      }
      if (supportsPopover) {
        if (dlg.matches(':popover-open')) dlg.hidePopover()
      } else if (dlg.open) {
        dlg.close()
      }
      return
    }

    if (open) {
      if (!dlg.open) dlg.showModal()
      const t = window.setTimeout(() => inputRef.current?.focus(), 40)
      return () => window.clearTimeout(t)
    }
    if (dlg.open) dlg.close()
  }, [isWindow, open])

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

  // Light-dismiss fallback when `closedby="any"` is unsupported in modal mode (e.g. Safari).
  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (isWindow) return
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

  const startWindowGesture = (kind: 'drag' | ResizeEdge, e: ReactPointerEvent<HTMLElement>) => {
    if (!isWindow) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    gestureRef.current = {
      kind,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startRect: currentRect,
    }
    setDragging(kind === 'drag')
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const moveWindowGesture = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gestureRef.current
    if (!g || g.pointerId !== e.pointerId) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    const next =
      g.kind === 'drag'
        ? clampWindowRect(
            { ...g.startRect, left: g.startRect.left + dx, top: g.startRect.top + dy },
            viewport.w,
            viewport.h,
          )
        : resizeWindowRect(g.startRect, g.kind, dx, dy, viewport.w, viewport.h)
    setCustomRect(next)
  }

  const endWindowGesture = (e: ReactPointerEvent<HTMLElement>, release = false) => {
    const g = gestureRef.current
    if (!g || g.pointerId !== e.pointerId) return
    if (release && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // Ignore if capture already ended.
      }
    }
    gestureRef.current = null
    setDragging(false)
  }

  const handleDragKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!isWindow) return
    const delta = arrowDelta(e)
    if (!delta) return
    e.preventDefault()
    const next = clampWindowRect(
      { ...currentRect, left: currentRect.left + delta.dx, top: currentRect.top + delta.dy },
      viewport.w,
      viewport.h,
    )
    setCustomRect(next)
    setAnnouncement(`Five window moved to ${next.left}, ${next.top}.`)
  }

  const handleResizeKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!isWindow) return
    const delta = arrowDelta(e)
    if (!delta) return
    e.preventDefault()
    const next = resizeWindowRect(currentRect, 'se', delta.dx, delta.dy, viewport.w, viewport.h)
    setCustomRect(next)
    setAnnouncement(`Five window resized to ${next.width} by ${next.height}.`)
  }

  const handleWindowKeyDown = (e: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (isWindow && e.key === 'Escape' && !e.defaultPrevented && openRef.current) {
      e.preventDefault()
      e.stopPropagation()
      closeSession()
    }
  }

  const handleWindowToggle = (e: ReactToggleEvent<HTMLDialogElement>) => {
    if (!isWindow || e.target !== dialogRef.current) return
    const state = (e.nativeEvent as ToggleEvent | undefined)?.newState
    if (state === 'closed' && openRef.current) closeSession()
  }

  const responding = busy || preparingSpeech || speaking

  const avatarMode: FiveMode = listening
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

  const statusDotClass =
    listening || speaking
      ? 'bg-[var(--sun)] shadow-[0_0_0_4px_rgb(210_80_42/0.18)]'
      : busy || preparingSpeech
        ? 'bg-[var(--ink)]'
        : 'bg-[var(--ink-2)]/40'

  const headerTitle = (
    <>
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-200 ${statusDotClass}`} />
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
    </>
  )

  return (
    <dialog
      ref={dialogRef}
      popover={isWindow ? 'manual' : undefined}
      closedby={isWindow ? undefined : 'any'}
      aria-labelledby="ask-five-title"
      data-lenis-prevent
      onClick={handleDialogClick}
      onKeyDown={handleWindowKeyDown}
      onToggle={handleWindowToggle}
      onClose={() => {
        if (!isWindow && openRef.current) closeSession()
      }}
      style={
        isWindow
          ? {
              left: `${currentRect.left}px`,
              top: `${currentRect.top}px`,
              width: `${currentRect.width}px`,
              height: `${currentRect.height}px`,
            }
          : undefined
      }
      className={
        isWindow
          ? 'five-dialog is-window'
          : 'five-dialog is-modal w-[min(520px,calc(100vw-20px))] max-h-[min(720px,calc(100svh-24px))]'
      }
    >
      <div
        className={`relative flex w-full flex-col overflow-hidden rounded-[28px] bg-[var(--card)] text-[var(--ink)] shadow-[0_0_0_1px_var(--line),0_32px_90px_-28px_rgb(0_0_0/0.6)] ${
          isWindow ? 'h-full' : 'max-h-[min(720px,calc(100svh-24px))]'
        }`}
      >
        {isWindow && (
          <span className="sr-only" aria-live="polite">
            {announcement}
          </span>
        )}

        {/* Header: draggable + keyboard-movable bar in floating window mode */}
        <header className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3 sm:px-5 sm:py-3.5">
          {isWindow ? (
            <div
              onPointerDown={(e) => startWindowGesture('drag', e)}
              onPointerMove={moveWindowGesture}
              onPointerUp={(e) => endWindowGesture(e, true)}
              onPointerCancel={(e) => endWindowGesture(e, true)}
              onLostPointerCapture={(e) => endWindowGesture(e)}
              className={`five-drag-handle flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-0.5 pr-1 ${
                dragging ? 'is-dragging' : ''
              }`}
            >
              <button
                type="button"
                onKeyDown={handleDragKeyDown}
                aria-label="Move Five window. Use arrow keys to move."
                title="Drag or use arrow keys to move window"
                className="grid h-7 w-6 shrink-0 place-items-center rounded-md text-[var(--ink-2)] transition-colors duration-150 hover:bg-[var(--card-2)] hover:text-[var(--ink)]"
              >
                <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
                  <circle cx="2.5" cy="2.5" r="1.2" />
                  <circle cx="7.5" cy="2.5" r="1.2" />
                  <circle cx="2.5" cy="7" r="1.2" />
                  <circle cx="7.5" cy="7" r="1.2" />
                  <circle cx="2.5" cy="11.5" r="1.2" />
                  <circle cx="7.5" cy="11.5" r="1.2" />
                </svg>
              </button>
              {headerTitle}
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3">{headerTitle}</div>
          )}

          <button
            type="button"
            onClick={closeSession}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ink-2)] transition-colors duration-150 hover:bg-[var(--card-2)] hover:text-[var(--ink)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        {/* Clean animated Five stage (no top buttons) */}
        <div
          className={`relative flex shrink-0 flex-col items-center justify-center overflow-hidden border-b border-[var(--line)] bg-[var(--sand)] px-5 ${
            isWindow ? 'py-3.5' : 'py-5'
          }`}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                avatarMode === 'speak' || avatarMode === 'listen'
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
                  width: (isWindow ? 100 : 118) + audioEnergy * 54,
                  height: (isWindow ? 100 : 118) + audioEnergy * 54,
                  opacity: 0.25 + audioEnergy * 0.55,
                }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
              />
            )}
            <Five
              key={open ? 'open' : 'closed'}
              draw={open}
              mode={avatarMode}
              energy={audioEnergy}
              size={isWindow ? 88 : 104}
              title="Five"
            />
          </div>
        </div>

        {/* Scrollable chat transcript */}
        <div
          ref={listRef}
          className={`flex-1 space-y-3 overflow-y-auto px-5 py-4 ${
            isWindow ? 'min-h-0' : 'min-h-[180px]'
          }`}
          aria-live="polite"
        >
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
          className={`flex items-center gap-2 border-t border-[var(--line)] ${
            isWindow ? 'py-3 pr-4 pb-3.5 pl-3' : 'p-3'
          }`}
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

      {isWindow && (
        <>
          {RESIZE_EDGES.map((item) => (
            <div
              key={item.edge}
              aria-hidden
              onPointerDown={(e) => startWindowGesture(item.edge, e)}
              onPointerMove={moveWindowGesture}
              onPointerUp={(e) => endWindowGesture(e, true)}
              onPointerCancel={(e) => endWindowGesture(e, true)}
              onLostPointerCapture={(e) => endWindowGesture(e)}
              className={`five-resize-handle absolute z-20 ${item.className}`}
            />
          ))}
          <button
            type="button"
            onKeyDown={handleResizeKeyDown}
            onPointerDown={(e) => startWindowGesture('se', e)}
            onPointerMove={moveWindowGesture}
            onPointerUp={(e) => endWindowGesture(e, true)}
            onPointerCancel={(e) => endWindowGesture(e, true)}
            onLostPointerCapture={(e) => endWindowGesture(e)}
            aria-label="Resize Five window. Use arrow keys to resize."
            title="Drag or use arrow keys to resize window"
            className="five-resize-handle absolute right-0 bottom-0 z-20 flex h-5 w-5 cursor-nwse-resize items-end justify-end rounded-br-[28px] pr-2 pb-2 text-[var(--ink-2)]/65 transition-colors duration-150 hover:text-[var(--ink)]"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
              <path d="M8 2.5L2.5 8M8 6L6 8" />
            </svg>
          </button>
        </>
      )}
    </dialog>
  )
}
