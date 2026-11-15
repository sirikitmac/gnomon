/**
 * Five: Gemini interactions + ElevenLabs TTS + MediaRecorder audio capture.
 *
 * System prompt lives in `five-ai.md` at the project root.
 */

import { GoogleGenAI } from '@google/genai'
import fiveSystemPrompt from '../../../five-ai.md?raw'

export type FiveTurn = { role: 'user' | 'five'; text: string }

export type AskFiveResult = {
  answer: string
  transcript?: string
  interactionId?: string
}

type InteractionOptions = {
  previousInteractionId?: string
  signal?: AbortSignal
  responseFormat?: {
    type: 'text'
    mime_type: 'application/json'
    schema: { [k: string]: unknown }
  }
  maxOutputTokens?: number
}

const AUDIO_REPLY_FORMAT = {
  type: 'text' as const,
  mime_type: 'application/json' as const,
  schema: {
    type: 'object',
    properties: {
      transcript: {
        type: 'string',
        description:
          'Exact verbatim transcript of what the user spoke in the audio, punctuated naturally. Empty string if no speech was heard.',
      },
      answer: {
        type: 'string',
        description:
          'Five’s concise, conversational response grounded only in the Gnomon website information.',
      },
    },
    required: ['transcript', 'answer'],
  },
}

const SYSTEM_PROMPT = fiveSystemPrompt.trim()

const cleanEnv = (v: string | undefined) => (v ?? '').trim()
const isPlaceholder = (v: string) => !v || v.startsWith('your_')

const RAW_GEMINI_KEY = cleanEnv(import.meta.env.VITE_GEMINI_API_KEY)
const GEMINI_KEY = isPlaceholder(RAW_GEMINI_KEY) ? '' : RAW_GEMINI_KEY
const GEMINI_MODEL = cleanEnv(import.meta.env.VITE_GEMINI_MODEL) || 'gemini-3.5-flash-lite'

const RAW_ELEVEN_KEY = cleanEnv(import.meta.env.VITE_ELEVENLABS_API_KEY)
const ELEVEN_KEY = isPlaceholder(RAW_ELEVEN_KEY) ? '' : RAW_ELEVEN_KEY
const ELEVEN_VOICE_ID = cleanEnv(import.meta.env.VITE_ELEVENLABS_VOICE_ID) || 'rBkiq5ZQ43ogwd6i4uIQ'
const ELEVEN_MODEL_ID = cleanEnv(import.meta.env.VITE_ELEVENLABS_MODEL_ID) || 'eleven_flash_v2_5'

const CUSTOM_API_URL = cleanEnv(import.meta.env.VITE_FIVE_API_URL)

export const GEMINI_READY = Boolean(GEMINI_KEY)
export const ELEVENLABS_READY = Boolean(ELEVEN_KEY)
export const FIVE_API_READY = Boolean(GEMINI_KEY || CUSTOM_API_URL)

let geminiClient: GoogleGenAI | null = null
const getGeminiClient = () => {
  if (!GEMINI_KEY) return null
  if (!geminiClient) geminiClient = new GoogleGenAI({ apiKey: GEMINI_KEY })
  return geminiClient
}

function extractTextParts(items: unknown[]): string[] {
  return items
    .map((item) =>
      typeof item === 'object' && item !== null && 'text' in item && typeof item.text === 'string'
        ? item.text
        : '',
    )
    .filter(Boolean)
}

function extractInteractionText(interaction: {
  output_text?: string | null
  outputs?: unknown[]
  steps?: unknown[]
}): string {
  if (typeof interaction.output_text === 'string' && interaction.output_text.trim()) {
    return interaction.output_text.trim()
  }
  if (Array.isArray(interaction.steps)) {
    const parts: string[] = []
    for (const step of interaction.steps) {
      if (
        typeof step === 'object' &&
        step !== null &&
        'type' in step &&
        step.type === 'model_output' &&
        'content' in step &&
        Array.isArray(step.content)
      ) {
        parts.push(...extractTextParts(step.content))
      }
    }
    if (parts.length) return parts.join('\n').trim()
  }
  if (Array.isArray(interaction.outputs)) {
    const parts = extractTextParts(interaction.outputs)
    if (parts.length) return parts.join('\n').trim()
  }
  return ''
}

function formatHistoryContext(history: FiveTurn[]): string {
  if (!history.length) return ''
  const recent = history
    .slice(-8)
    .map((t) => `${t.role === 'user' ? 'User' : 'Five'}: ${t.text}`)
    .join('\n')
  return `Previous conversation:\n${recent}`
}

async function waitAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const id = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(id)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

async function runModelInteraction(
  buildInput: (withHistory: boolean) => Parameters<GoogleGenAI['interactions']['create']>[0]['input'],
  options?: InteractionOptions,
): Promise<AskFiveResult> {
  const ai = getGeminiClient()
  if (!ai) {
    await waitAbortable(260, options?.signal)
    return {
      answer:
        'Sorry, I can’t answer live questions right now. Please try again shortly or explore the sites and tools in Gnomon.',
    }
  }

  const call = (usePrevId: boolean) =>
    ai.interactions.create(
      {
        model: GEMINI_MODEL,
        input: buildInput(!usePrevId),
        system_instruction: SYSTEM_PROMPT,
        ...(usePrevId && options?.previousInteractionId
          ? { previous_interaction_id: options.previousInteractionId }
          : {}),
        ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
        generation_config: {
          thinking_level: GEMINI_MODEL.includes('3.8') ? 'low' : 'minimal',
          max_output_tokens: options?.maxOutputTokens ?? 450,
        },
      },
      options?.signal ? { signal: options.signal } : undefined,
    )

  let interaction
  try {
    interaction = await call(Boolean(options?.previousInteractionId))
  } catch (err) {
    if ((err as Error).name === 'AbortError' || !options?.previousInteractionId) throw err
    interaction = await call(false)
  }

  const answer = extractInteractionText(interaction)
  if (!answer) throw new Error('No reply text returned.')

  return {
    answer,
    interactionId: interaction.id,
  }
}

export async function askFive(
  question: string,
  history: FiveTurn[],
  options?: { previousInteractionId?: string; signal?: AbortSignal },
): Promise<AskFiveResult> {
  if (CUSTOM_API_URL) {
    const r = await fetch(CUSTOM_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
      signal: options?.signal,
    })
    if (!r.ok) throw new Error(`Five’s service answered ${r.status}`)
    const data = (await r.json()) as { answer?: unknown; interactionId?: unknown }
    if (typeof data.answer !== 'string' || !data.answer.trim()) {
      throw new Error('Five’s service sent no answer')
    }
    return {
      answer: data.answer.trim(),
      interactionId: typeof data.interactionId === 'string' ? data.interactionId : undefined,
    }
  }

  const contextPrefix = formatHistoryContext(history)
  return runModelInteraction(
    (withHistory) => (withHistory && contextPrefix ? `${contextPrefix}\n\nUser: ${question}` : question),
    options,
  )
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : '')
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to encode audio'))
    reader.readAsDataURL(blob)
  })
}

function normalizeAudioMime(rawMime: string): string {
  const base = rawMime.split(';')[0]?.trim().toLowerCase() || 'audio/webm'
  if (base === 'audio/wave' || base === 'audio/x-wav') return 'audio/wav'
  if (base === 'audio/mp4' || base === 'audio/x-m4a') return 'audio/m4a'
  return base
}

function parseAudioReply(raw: string): { transcript: string; answer: string } {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  try {
    const parsed = JSON.parse(stripped) as { transcript?: unknown; answer?: unknown }
    const transcript = typeof parsed.transcript === 'string' ? parsed.transcript.trim() : ''
    const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''
    if (answer || transcript) {
      return {
        transcript,
        answer: answer || 'I didn’t catch a question there — try speaking again or type below.',
      }
    }
  } catch {
    // Fall back to plain text if output was not valid JSON.
  }
  return { transcript: '', answer: raw.trim() }
}

export async function askFiveAudio(
  audioBlob: Blob,
  history: FiveTurn[],
  options?: { previousInteractionId?: string; signal?: AbortSignal },
): Promise<AskFiveResult> {
  if (CUSTOM_API_URL) {
    return askFive('Voice question', history, options)
  }

  if (!getGeminiClient()) {
    await waitAbortable(260, options?.signal)
    return {
      transcript: '',
      answer:
        'Sorry, I can’t process voice questions right now. Please try again shortly or type below.',
    }
  }

  const base64 = await blobToBase64(audioBlob)
  if (!base64) throw new Error('Empty audio recording')

  const mimeType = normalizeAudioMime(audioBlob.type)
  const contextPrefix = formatHistoryContext(history)
  const basePrompt =
    'Listen carefully to the user audio (a question about Gnomon). Transcribe the exact spoken words verbatim into `transcript` (use an empty string if silent or unintelligible), and provide Five’s direct answer in `answer`.'

  const raw = await runModelInteraction(
    (withHistory) => {
      const prompt = withHistory && contextPrefix ? `${contextPrefix}\n\n${basePrompt}` : basePrompt
      return [
        {
          type: 'user_input',
          content: [
            { type: 'audio', data: base64, mime_type: mimeType },
            { type: 'text', text: prompt },
          ],
        },
      ]
    },
    {
      ...options,
      responseFormat: AUDIO_REPLY_FORMAT,
      maxOutputTokens: 700,
    },
  )

  const parsed = parseAudioReply(raw.answer)
  // Reset server interaction chaining after structured JSON output so later plain-text turns stay plain text.
  return {
    transcript: parsed.transcript,
    answer: parsed.answer,
  }
}

/* ---------- Voice I/O: MediaRecorder mic capture + ElevenLabs TTS ---------- */

const RECORDER_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
]

export const canListen = () =>
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof MediaRecorder !== 'undefined'

export const canSpeak = () =>
  ELEVENLABS_READY || (typeof window !== 'undefined' && 'speechSynthesis' in window)

export type VoiceRecorderHandle = {
  stop: () => void
  cancel: () => void
}

/**
 * Record user speech with MediaRecorder + Web Audio input energy metering.
 * Unlike Web SpeechRecognition on Linux/Chromium, stays active until stop() or cancel().
 */
export function startVoiceRecorder(handlers: {
  onReady?: () => void
  onEnergy?: (level: number) => void
  onStop: (audio: Blob) => void
  onError: (msg: string) => void
}): VoiceRecorderHandle {
  if (!canListen()) {
    handlers.onError('Voice input isn’t supported in this browser — you can type below.')
    return { stop: () => {}, cancel: () => {} }
  }

  let cancelled = false
  let stopped = false
  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let audioCtx: AudioContext | null = null
  let raf = 0
  const chunks: Blob[] = []

  const cleanup = () => {
    cancelAnimationFrame(raf)
    raf = 0
    if (audioCtx) {
      void audioCtx.close().catch(() => {})
      audioCtx = null
    }
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      stream = null
    }
    handlers.onEnergy?.(0)
  }

  const start = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (cancelled) {
        for (const t of media.getTracks()) t.stop()
        return
      }
      stream = media

      const mimeType =
        typeof MediaRecorder.isTypeSupported === 'function'
          ? RECORDER_MIMES.find((m) => MediaRecorder.isTypeSupported(m))
          : undefined
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      recorder = rec

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data)
      }
      rec.onerror = () => {
        cleanup()
        if (!cancelled) handlers.onError('Microphone stopped unexpectedly. Try again or type below.')
      }
      rec.onstop = () => {
        const finalType = rec.mimeType || mimeType || 'audio/webm'
        cleanup()
        if (cancelled) return
        const blob = new Blob(chunks, { type: finalType })
        handlers.onStop(blob)
      }

      // Live microphone amplitude metering (non-blocking)
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioCtx) {
          const ctx = new AudioCtx()
          audioCtx = ctx
          const src = ctx.createMediaStreamSource(media)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          src.connect(analyser)
          void ctx.resume().catch(() => {})

          const bins = new Uint8Array(analyser.frequencyBinCount)
          const meter = () => {
            if (cancelled || stopped) return
            analyser.getByteFrequencyData(bins)
            let sum = 0
            const count = Math.min(bins.length, 32)
            for (let i = 0; i < count; i++) sum += bins[i]
            handlers.onEnergy?.(Math.min(1, sum / (count * 120)))
            raf = requestAnimationFrame(meter)
          }
          raf = requestAnimationFrame(meter)
        }
      } catch {
        /* visual metering is optional */
      }

      if (stopped) {
        cleanup()
        return
      }

      rec.start(150)
      handlers.onReady?.()
    } catch (err) {
      cleanup()
      if (cancelled) return
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        handlers.onError('Microphone permission was denied. Allow mic access or type below.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        handlers.onError('No microphone was found on this device.')
      } else {
        handlers.onError('Couldn’t start microphone input right now.')
      }
    }
  }

  void start()

  return {
    stop: () => {
      if (stopped || cancelled) return
      stopped = true
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          cleanup()
          handlers.onError('Hold briefly while speaking, then tap send.')
        }
      } else {
        cancelled = true
        cleanup()
        handlers.onError('Hold briefly while speaking, then tap send.')
      }
    },
    cancel: () => {
      if (cancelled) return
      cancelled = true
      stopped = true
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          cleanup()
        }
      } else {
        cleanup()
      }
    },
  }
}

function toSpeechText(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function speakWithBrowser(
  text: string,
  handlers?: {
    onStart?: () => void
    onEnd?: () => void
  },
): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    handlers?.onEnd?.()
    return () => {}
  }
  const synth = window.speechSynthesis
  synth.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.rate = 1.0
  utt.pitch = 1.02
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    handlers?.onEnd?.()
  }
  utt.onstart = () => handlers?.onStart?.()
  utt.onend = finish
  utt.onerror = finish
  handlers?.onStart?.()
  synth.speak(utt)
  return () => {
    finished = true
    synth.cancel()
  }
}

/**
 * Speak Five's response using ElevenLabs TTS (with Web Audio amplitude metering)
 * and silently fall back to browser speechSynthesis if unavailable.
 */
export function speakFive(
  text: string,
  handlers?: {
    onStart?: () => void
    onEnd?: () => void
    onEnergy?: (level: number) => void
  },
): () => void {
  const clean = toSpeechText(text)
  if (!clean) {
    handlers?.onEnd?.()
    return () => {}
  }

  if (!ELEVEN_KEY) {
    return speakWithBrowser(clean, handlers)
  }

  let stopped = false
  let finished = false
  let raf = 0
  let objectUrl: string | null = null
  let audio: HTMLAudioElement | null = null
  let audioCtx: AudioContext | null = null
  let fallbackStop: () => void = () => {}
  const abort = new AbortController()

  const finish = () => {
    if (finished) return
    finished = true
    handlers?.onEnergy?.(0)
    handlers?.onEnd?.()
  }

  const cleanupMedia = () => {
    cancelAnimationFrame(raf)
    raf = 0
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio = null
    }
    if (audioCtx) {
      void audioCtx.close().catch(() => {})
      audioCtx = null
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }
  }

  const startPlayback = async () => {
    try {
      const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE_ID)}?output_format=mp3_44100_128`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVEN_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: clean,
          model_id: ELEVEN_MODEL_ID,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.78,
          },
        }),
        signal: abort.signal,
      })

      if (!res.ok) {
        throw new Error(`Speech ${res.status}`)
      }

      const blob = await res.blob()
      if (stopped) return

      objectUrl = URL.createObjectURL(blob)
      const el = new Audio(objectUrl)
      audio = el

      // Attach optional live energy metering without blocking playback
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioCtx) {
          const ctx = new AudioCtx()
          audioCtx = ctx
          const src = ctx.createMediaElementSource(el)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          src.connect(analyser)
          analyser.connect(ctx.destination)
          void ctx.resume().catch(() => {})

          const bins = new Uint8Array(analyser.frequencyBinCount)
          const meter = () => {
            if (stopped || finished) return
            analyser.getByteFrequencyData(bins)
            let sum = 0
            const count = Math.min(bins.length, 32)
            for (let i = 0; i < count; i++) sum += bins[i]
            handlers?.onEnergy?.(Math.min(1, sum / (count * 135)))
            raf = requestAnimationFrame(meter)
          }
          raf = requestAnimationFrame(meter)
        }
      } catch {
        /* fallback animation keyframes in Five.tsx handle energy === 0 gracefully */
      }

      el.onended = () => {
        cleanupMedia()
        finish()
      }
      el.onerror = () => {
        cleanupMedia()
        if (!stopped) {
          fallbackStop = speakWithBrowser(clean, handlers)
        }
      }

      handlers?.onStart?.()
      await el.play()
    } catch (err) {
      cleanupMedia()
      if (stopped || (err as Error).name === 'AbortError') return
      fallbackStop = speakWithBrowser(clean, handlers)
    }
  }

  void startPlayback()

  return () => {
    stopped = true
    finished = true
    abort.abort()
    fallbackStop()
    cleanupMedia()
    handlers?.onEnergy?.(0)
  }
}
