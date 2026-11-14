/**
 * Ask Five: the connection point for the assistant behind the "Ask Five" window on the landing page.
 *
 * FOR THE BACKEND (Jiandale): set VITE_FIVE_API_URL (e.g. in .env.local or the Vercel project
 * settings) to an endpoint that accepts
 *     POST { question: string, history: { role: 'user' | 'five', text: string }[] }
 * and returns
 *     200 { answer: string }
 * Nothing else in the app needs to change. Until the variable is set, askFive() answers with a
 * placeholder so the window can be designed and tested.
 *
 * Voice uses the browser's own speech services for now (no key needed): speech-to-text through the
 * Web Speech API where the browser has it (Chrome, Edge, Safari), and text-to-speech through
 * speechSynthesis. To use a hosted voice service instead, replace startListening() / speak() here.
 */

export type FiveTurn = { role: 'user' | 'five'; text: string }

const API_URL: string | undefined = import.meta.env.VITE_FIVE_API_URL

/** True once a backend is configured. */
export const FIVE_API_READY = Boolean(API_URL)

export async function askFive(question: string, history: FiveTurn[], signal?: AbortSignal): Promise<string> {
  if (!API_URL) {
    await new Promise((r) => setTimeout(r, 700))
    return 'I can’t answer questions yet: my connection is still being built. In the meantime, open the app to check any site and date.'
  }
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
    signal,
  })
  if (!r.ok) throw new Error(`Five’s service answered ${r.status}`)
  const data = (await r.json()) as { answer?: unknown }
  if (typeof data.answer !== 'string' || !data.answer.trim()) throw new Error('Five’s service sent no answer')
  return data.answer.trim()
}

/* ---------- voice ---------- */

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const canListen = () => recognitionCtor() !== null
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/**
 * Listen for one question. Calls onText with the words so far, onDone with the final text (empty
 * if nothing was heard) and onError with a short message. Returns a function that stops listening.
 */
export function startListening(handlers: { onText: (t: string) => void; onDone: (t: string) => void; onError: (msg: string) => void }): () => void {
  const Ctor = recognitionCtor()
  if (!Ctor) {
    handlers.onError('Voice input isn’t available in this browser. Type your question instead.')
    return () => {}
  }
  const rec = new Ctor()
  rec.lang = 'en-US'
  rec.interimResults = true
  rec.continuous = false
  let text = ''
  rec.onresult = (e) => {
    text = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim()
    handlers.onText(text)
  }
  rec.onerror = (e) => {
    handlers.onError(e.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in the browser to ask by voice.' : 'Couldn’t hear that. Try again or type your question.')
  }
  rec.onend = () => handlers.onDone(text)
  rec.start()
  return () => rec.stop()
}

/** Read an answer aloud. Returns a function that stops speaking. */
export function speak(text: string, onEnd?: () => void): () => void {
  if (!canSpeak()) { onEnd?.(); return () => {} }
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 1
  u.onend = () => onEnd?.()
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
  return () => { window.speechSynthesis.cancel(); onEnd?.() }
}
