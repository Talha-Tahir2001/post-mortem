"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const WS_URL = "wss://agents.assemblyai.com/v1/ws"
const WORKLET_URL = "/worklets/pcm-processor.js"
const OUTPUT_SAMPLE_RATE = 24000

export type VoiceStatus = "idle" | "connecting" | "ready" | "ended" | "error"

export interface TranscriptEntry {
  id: string
  role: "user" | "agent"
  text: string
  final: boolean
  itemId?: string
  replyId?: string
  at: number
}

export interface VoiceToolCall {
  name: string
  ok: boolean
  at: number
}

interface PendingTool {
  call_id: string
  result: Record<string, unknown>
  is_error: boolean
}

interface SessionRefs {
  ws: WebSocket | null
  ctx: AudioContext | null
  stream: MediaStream | null
  worklet: AudioWorkletNode | null
  analyser: AnalyserNode | null
  ready: boolean
  ended: boolean
  sessionId: string | null
  playbackTime: number
  sources: Set<AudioBufferSourceNode>
  lastEvent: string | null
  pending: PendingTool[]
  muted: boolean
  soundOn: boolean
  endCuePlayed: boolean
}

const createSessionRefs = (): SessionRefs => ({
  ws: null,
  ctx: null,
  stream: null,
  worklet: null,
  analyser: null,
  ready: false,
  ended: false,
  sessionId: null,
  playbackTime: 0,
  sources: new Set(),
  lastEvent: null,
  pending: [],
  muted: false,
  soundOn: true,
  endCuePlayed: false,
})

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function pcm16ToFloat32(base64: string): Float32Array | null {
  try {
    const binary = atob(base64)
    const pcm16 = new Int16Array(binary.length / 2)
    for (let i = 0; i < pcm16.length; i++) {
      pcm16[i] = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8)
    }
    const floats = new Float32Array(pcm16.length)
    for (let i = 0; i < pcm16.length; i++) floats[i] = pcm16[i] / 32768
    return floats
  } catch {
    return null
  }
}

type Cue = "connect" | "end"

/**
 * Short two-note chime. Uses its own throwaway AudioContext so it still rings
 * out after the call's context is torn down.
 */
async function playCue(cue: Cue): Promise<void> {
  try {
    const ctx = new AudioContext()
    if (ctx.state === "suspended") await ctx.resume()
    const start = ctx.currentTime
    const notes = cue === "connect" ? [659.25, 987.77] : [659.25, 493.88]

    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = "triangle"
      oscillator.frequency.value = frequency

      const at = start + index * 0.1
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.05, at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16)

      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(at)
      oscillator.stop(at + 0.18)
    })

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined)
    }, 700)
  } catch {
    /* audio not allowed yet — the call still works without the chime */
  }
}

interface UseVoiceSessionOptions {
  executeTool: (
    name: string,
    args: Record<string, unknown>
  ) =>
    | { ok: boolean; result: Record<string, unknown> }
    | Promise<{ ok: boolean; result: Record<string, unknown> }>
  onSessionReady?: (sessionId: string) => void
  onSessionEnded?: (sessionId: string | null) => void
}

/**
 * Browser voice client: token -> WebSocket -> AudioWorklet capture -> playback,
 * plus the interactive tool-call contract (queue on tool.call, flush on
 * reply.done). See PLAN.MD §7.3.
 */
export function useVoiceSession(options: UseVoiceSessionOptions) {
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const refs = useRef<SessionRefs>(createSessionRefs())
  const entriesRef = useRef<TranscriptEntry[]>([])

  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<TranscriptEntry[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [agentSpeaking, setAgentSpeaking] = useState(false)
  const [muted, setMutedState] = useState(false)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [soundOn, setSoundOnState] = useState(true)

  const publishEntries = useCallback(() => {
    setEntries([...entriesRef.current])
  }, [])

  const upsertEntry = useCallback(
    (match: (entry: TranscriptEntry) => boolean, next: TranscriptEntry, mode: "replace" | "push") => {
      const list = entriesRef.current
      const index = list.findIndex(match)
      if (index >= 0) {
        list[index] = next
      } else if (mode === "push") {
        list.push(next)
      }
      publishEntries()
    },
    [publishEntries]
  )

  const send = useCallback((payload: Record<string, unknown>) => {
    const { ws } = refs.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload))
  }, [])

  const flushTools = useCallback(() => {
    const session = refs.current
    if (session.lastEvent !== "reply.done" || session.pending.length === 0) return
    const queued = session.pending
    session.pending = []
    for (const tool of queued) {
      send({
        type: "tool.result",
        call_id: tool.call_id,
        result: JSON.stringify(tool.result),
        is_error: tool.is_error,
      })
    }
  }, [send])

  const cleanup = useCallback(() => {
    const session = refs.current
    session.ready = false

    try {
      session.worklet?.disconnect()
    } catch {
      /* already gone */
    }
    session.worklet = null

    session.stream?.getTracks().forEach((track) => track.stop())
    session.stream = null

    try {
      session.analyser?.disconnect()
    } catch {
      /* already gone */
    }
    session.analyser = null
    setAnalyser(null)

    for (const source of session.sources) {
      try {
        source.stop()
      } catch {
        /* already stopped */
      }
    }
    session.sources.clear()

    if (session.ctx && session.ctx.state !== "closed") {
      void session.ctx.close().catch(() => undefined)
    }
    session.ctx = null

    if (session.ws) {
      try {
        session.ws.close()
      } catch {
        /* already gone */
      }
      session.ws = null
    }

    setAgentSpeaking(false)
  }, [])

  const playAudio = useCallback((base64: string) => {
    const session = refs.current
    const ctx = session.ctx
    if (!ctx || ctx.state === "closed") return

    const floats = pcm16ToFloat32(base64)
    if (!floats || floats.length === 0) return

    const buffer = ctx.createBuffer(1, floats.length, OUTPUT_SAMPLE_RATE)
    buffer.getChannelData(0).set(floats)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    const now = ctx.currentTime
    session.playbackTime = Math.max(session.playbackTime, now)
    source.start(session.playbackTime)
    session.playbackTime += buffer.duration

    session.sources.add(source)
    source.onended = () => {
      session.sources.delete(source)
    }
  }, [])

  /** Barge-in: drop queued agent audio the moment the responder starts talking. */
  const stopPlayback = useCallback(() => {
    const session = refs.current
    for (const source of session.sources) {
      try {
        source.stop()
      } catch {
        /* already stopped */
      }
      session.sources.delete(source)
    }
    if (session.ctx && session.ctx.state !== "closed") {
      session.playbackTime = session.ctx.currentTime
    }
    setAgentSpeaking(false)
  }, [])

  const handleMessage = useCallback(
    (raw: string) => {
      let message: Record<string, unknown>
      try {
        message = JSON.parse(raw) as Record<string, unknown>
      } catch {
        return
      }

      const session = refs.current
      const type = message.type as string

      switch (type) {
        case "session.ready": {
          session.ready = true
          session.sessionId = (message.session_id as string) ?? null
          session.lastEvent = null
          setSessionId(session.sessionId)
          setStatus("ready")
          setError(null)
          if (session.soundOn) void playCue("connect")
          optionsRef.current.onSessionReady?.(session.sessionId)
          break
        }

        case "session.updated": {
          break
        }

        case "input.speech.started": {
          session.lastEvent = type
          stopPlayback()
          break
        }

        case "reply.started": {
          session.lastEvent = type
          setAgentSpeaking(true)
          break
        }

        case "reply.audio": {
          setAgentSpeaking(true)
          playAudio(message.data as string)
          break
        }

        case "transcript.user.delta":
        case "transcript.user": {
          const itemId = (message.item_id as string) ?? "user"
          const text = (message.text as string) ?? ""
          const final = type === "transcript.user"
          session.lastEvent = type
          upsertEntry(
            (entry) => entry.role === "user" && entry.itemId === itemId && !entry.final,
            { id: itemId, role: "user", itemId, text, final, at: Date.now() },
            "push"
          )
          break
        }

        case "transcript.agent.delta": {
          const replyId = (message.reply_id as string) ?? "agent"
          const delta = (message.delta as string) ?? ""
          const list = entriesRef.current
          const index = list.findIndex(
            (entry) => entry.role === "agent" && entry.replyId === replyId && !entry.final
          )
          if (index >= 0) {
            const previous = list[index]
            list[index] = {
              ...previous,
              text: previous.text ? `${previous.text} ${delta}` : delta,
            }
          } else {
            list.push({
              id: replyId,
              role: "agent",
              replyId,
              text: delta,
              final: false,
              at: Date.now(),
            })
          }
          publishEntries()
          break
        }

        case "transcript.agent": {
          const replyId = (message.reply_id as string) ?? "agent"
          const text = (message.text as string) ?? ""
          const list = entriesRef.current
          const index = list.findIndex(
            (entry) => entry.role === "agent" && entry.replyId === replyId
          )
          if (index >= 0) {
            list[index] = { ...list[index], text, final: true }
            publishEntries()
          } else if (text) {
            list.push({
              id: replyId,
              role: "agent",
              replyId,
              text,
              final: true,
              at: Date.now(),
            })
            publishEntries()
          }
          break
        }

        case "reply.done": {
          session.lastEvent = "reply.done"
          setAgentSpeaking(false)
          if ((message.status as string) === "interrupted") {
            // The responder cut the agent off: drop anything still buffered.
            session.pending = []
            stopPlayback()
          } else {
            flushTools()
          }
          break
        }

        case "tool.call": {
          const callId = message.call_id as string
          const name = message.name as string
          const args = (message.arguments as Record<string, unknown>) ?? {}

          void (async () => {
            let outcome: { ok: boolean; result: Record<string, unknown> }
            try {
              outcome = await optionsRef.current.executeTool(name, args)
            } catch (toolError) {
              outcome = {
                ok: false,
                result: {
                  error: toolError instanceof Error ? toolError.message : "Tool failed.",
                },
              }
            }

            session.pending.push({
              call_id: callId,
              result: outcome.result,
              is_error: !outcome.ok,
            })
            flushTools()
          })()
          break
        }

        case "session.ended": {
          session.ended = true
          session.ready = false
          setStatus("ended")
          setAgentSpeaking(false)
          if (!session.endCuePlayed) {
            session.endCuePlayed = true
            if (session.soundOn) void playCue("end")
          }
          optionsRef.current.onSessionEnded?.(session.sessionId)
          cleanup()
          break
        }

        case "session.error": {
          const detail = `${(message.code as string) ?? "error"}: ${(message.message as string) ?? "session error"}`
          setError(detail)
          setStatus("error")
          break
        }

        default:
          break
      }
    },
    [cleanup, flushTools, playAudio, publishEntries, stopPlayback, upsertEntry]
  )

  const connect = useCallback(async () => {
    const session = refs.current
    if (session.ws || session.ended) return

    setStatus("connecting")
    setError(null)

    try {
      const response = await fetch("/api/voice-token")
      const payload = (await response.json().catch(() => ({}))) as {
        token?: string
        agentId?: string
        error?: string
      }
      if (!response.ok || !payload.token || !payload.agentId) {
        throw new Error(payload.error ?? "Could not fetch a voice token.")
      }

      const ctx = new AudioContext()
      await ctx.audioWorklet.addModule(WORKLET_URL)
      if (ctx.state === "suspended") await ctx.resume()

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false },
      })

      const source = ctx.createMediaStreamSource(stream)
      const worklet = new AudioWorkletNode(ctx, "pcm-processor", {
        processorOptions: {
          inputSampleRate: ctx.sampleRate,
          targetSampleRate: OUTPUT_SAMPLE_RATE,
          flushSamples: OUTPUT_SAMPLE_RATE / 10,
        },
      })

      // Level meter feed. The muted sink keeps the graph pulled without
      // looping the microphone back out to the speakers.
      const analyserNode = ctx.createAnalyser()
      analyserNode.fftSize = 256
      analyserNode.smoothingTimeConstant = 0.85
      const analyserSink = ctx.createGain()
      analyserSink.gain.value = 0
      source.connect(analyserNode)
      analyserNode.connect(analyserSink)
      analyserSink.connect(ctx.destination)

      const url = new URL(WS_URL)
      url.searchParams.set("token", payload.token)
      const ws = new WebSocket(url.toString())

      worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const current = refs.current
        if (current.ready && !current.muted && current.ws?.readyState === WebSocket.OPEN) {
          current.ws.send(JSON.stringify({ type: "input.audio", audio: toBase64(event.data) }))
        }
      }

      source.connect(worklet)
      worklet.connect(ctx.destination)

      session.ctx = ctx
      session.stream = stream
      session.worklet = worklet
      session.analyser = analyserNode
      session.ws = ws
      session.playbackTime = 0
      session.pending = []
      setAnalyser(analyserNode)

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ type: "session.update", session: { agent_id: payload.agentId } }))
      })

      ws.addEventListener("message", (event) => handleMessage(String(event.data)))

      ws.addEventListener("close", () => {
        const current = refs.current
        if (current.ws !== ws) return
        current.ready = false
        current.ws = null
        if (current.ended) return
        setStatus((previous) =>
          previous === "connecting" || previous === "error" ? "error" : "ended"
        )
        setAgentSpeaking(false)
      })

      ws.addEventListener("error", () => {
        setError("WebSocket error — check your connection and API key.")
      })
    } catch (cause) {
      cleanup()
      setStatus("error")
      setError(cause instanceof Error ? cause.message : "Could not start the call.")
    }
  }, [cleanup, handleMessage])

  const end = useCallback(() => {
    const session = refs.current
    if (!session.endCuePlayed && session.soundOn) {
      session.endCuePlayed = true
      void playCue("end")
    }
    if (session.ws && session.ws.readyState === WebSocket.OPEN && !session.ended) {
      // Never bare-close: session.end stops the billable resume window.
      session.ws.send(JSON.stringify({ type: "session.end" }))
      setStatus("ended")
    } else {
      session.ended = true
      cleanup()
      setStatus("ended")
      optionsRef.current.onSessionEnded?.(session.sessionId)
    }
  }, [cleanup])

  const setMuted = useCallback((next: boolean) => {
    refs.current.muted = next
    refs.current.stream?.getTracks().forEach((track) => {
      track.enabled = !next
    })
    setMutedState(next)
  }, [])

  const setSoundOn = useCallback((next: boolean) => {
    refs.current.soundOn = next
    setSoundOnState(next)
  }, [])

  const reset = useCallback(() => {
    entriesRef.current = []
    publishEntries()
    refs.current = createSessionRefs()
    setSessionId(null)
    setStatus("idle")
    setError(null)
    setAnalyser(null)
  }, [publishEntries])

  useEffect(() => {
    const onPageHide = () => {
      const session = refs.current
      // Synchronous on purpose: async work does not survive teardown.
      if (session.ws && session.ws.readyState === WebSocket.OPEN && !session.ended) {
        session.ws.send(JSON.stringify({ type: "session.end" }))
      }
    }
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.removeEventListener("pagehide", onPageHide)
      const session = refs.current
      if (session.ws && session.ws.readyState === WebSocket.OPEN && !session.ended) {
        session.ws.send(JSON.stringify({ type: "session.end" }))
      }
      cleanup()
    }
  }, [cleanup])

  return {
    status,
    error,
    entries,
    sessionId,
    agentSpeaking,
    muted,
    analyser,
    soundOn,
    connect,
    end,
    reset,
    setMuted,
    setSoundOn,
  }
}
