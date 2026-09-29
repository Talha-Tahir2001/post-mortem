/** Flatten the AssemblyAI session timeline artifact into messages + hard facts. */

export interface TimelineToolCall {
  call_id: string
  name: string
  arguments?: Record<string, unknown>
  result?: string
  dispatched_at_ms?: number
  result_received_at_ms?: number
  duration_ms?: number
  is_error?: boolean
  timed_out?: boolean
}

export interface TimelineTurn {
  turn_id?: string
  item_id?: string
  status?: string
  trigger?: string
  user_transcript?: string | null
  user_confidence?: number | null
  agent_text?: string | null
  agent_reply_started_at_ms?: number
  agent_reply_ended_at_ms?: number
  time_to_first_audio_ms?: number
  tool_calls?: TimelineToolCall[]
}

export interface Timeline {
  session_id?: string
  started_at_unix_ms?: number
  turns?: TimelineTurn[]
}

export type TimelineActor = "user" | "agent" | "tool"

export interface TimelineMessage {
  role: TimelineActor
  text?: string
  name?: string
  arguments?: Record<string, unknown>
  result?: string
  error?: boolean
  at?: number
}

export interface HardFacts {
  session_id: string | null
  started_at_ms: number | null
  ended_at_ms: number | null
  duration_seconds: number | null
  turn_count: number
  user_turn_count: number
  agent_turn_count: number
  time_to_first_audio_ms: number | null
  tool_calls: { name: string; arguments: Record<string, unknown> | null; ok: boolean }[]
}

export function flattenTimeline(timeline: Timeline | null): TimelineMessage[] {
  if (!timeline) return []
  const messages: TimelineMessage[] = []

  for (const turn of timeline.turns ?? []) {
    if (turn.user_transcript) {
      messages.push({ role: "user", text: turn.user_transcript, at: turn.agent_reply_started_at_ms })
    }
    for (const call of turn.tool_calls ?? []) {
      messages.push({
        role: "tool",
        name: call.name,
        arguments: call.arguments,
        result: call.result,
        error: Boolean(call.is_error || call.timed_out),
        at: call.dispatched_at_ms,
      })
    }
    if (turn.agent_text) {
      messages.push({ role: "agent", text: turn.agent_text, at: turn.agent_reply_started_at_ms })
    }
  }

  return messages
}

export function extractHardFacts(
  sessionId: string | null,
  timeline: Timeline | null
): HardFacts {
  const turns = timeline?.turns ?? []
  const startedAt = timeline?.started_at_unix_ms ?? null

  let endedAt = startedAt
  const latencies: number[] = []
  let userTurns = 0
  let agentTurns = 0
  const toolCalls: HardFacts["tool_calls"] = []

  for (const turn of turns) {
    if (turn.user_transcript) userTurns += 1
    if (turn.agent_text) agentTurns += 1
    if (typeof turn.time_to_first_audio_ms === "number") latencies.push(turn.time_to_first_audio_ms)

    const lastStamp = turn.agent_reply_ended_at_ms ?? turn.agent_reply_started_at_ms
    if (typeof lastStamp === "number" && (endedAt === null || lastStamp > endedAt)) {
      endedAt = lastStamp
    }

    for (const call of turn.tool_calls ?? []) {
      toolCalls.push({
        name: call.name,
        arguments: call.arguments ?? null,
        ok: !(call.is_error || call.timed_out),
      })
    }
  }

  latencies.sort((a, b) => a - b)
  const median = latencies.length
    ? latencies[Math.floor(latencies.length / 2)]
    : null

  return {
    session_id: sessionId ?? timeline?.session_id ?? null,
    started_at_ms: startedAt,
    ended_at_ms: endedAt,
    duration_seconds:
      startedAt !== null && endedAt !== null
        ? Math.round(((endedAt - startedAt) / 1000) * 10) / 10
        : null,
    turn_count: turns.length,
    user_turn_count: userTurns,
    agent_turn_count: agentTurns,
    time_to_first_audio_ms: median,
    tool_calls: toolCalls,
  }
}

export function describeRole(role: TimelineActor): string {
  return role === "user" ? "Responder" : role === "agent" ? "Agent" : "Tool"
}
