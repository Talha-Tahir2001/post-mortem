import { artifactUrl, getApiKey, getSession, type SessionDetail } from "@/lib/assemblyai"
import type { IncidentFacts } from "@/lib/postmortem-schema"
import {
  extractHardFacts,
  flattenTimeline,
  type Timeline,
  type TimelineMessage,
} from "@/lib/timeline"

export interface SessionTimeline {
  session: SessionDetail | null
  timeline: Timeline | null
  messages: TimelineMessage[]
  facts: IncidentFacts
}

/**
 * Session record + flattened timeline + the hard facts derived from both.
 * Shared by the postmortem generator and the transcript endpoint.
 */
export async function loadSessionTimeline(sessionId: string | null): Promise<SessionTimeline> {
  let session: SessionDetail | null = null
  let timeline: Timeline | null = null

  if (sessionId && getApiKey()) {
    try {
      session = await getSession(sessionId)
      const url = artifactUrl(session, "timeline")
      if (url) {
        // Pre-signed URL: no Authorization header, and never cached (it expires).
        const res = await fetch(url, { cache: "no-store" })
        if (res.ok) timeline = (await res.json()) as Timeline
      }
    } catch (error) {
      console.error("[session-timeline] fetch failed:", error)
    }
  }

  const messages = flattenTimeline(timeline)
  const rawFacts = extractHardFacts(sessionId, timeline)

  const facts: IncidentFacts = {
    session_id: rawFacts.session_id,
    duration_seconds: rawFacts.duration_seconds ?? session?.duration_seconds ?? null,
    turn_count: rawFacts.turn_count,
    user_turn_count: rawFacts.user_turn_count,
    agent_turn_count: rawFacts.agent_turn_count,
    time_to_first_audio_ms: rawFacts.time_to_first_audio_ms,
    tool_calls: rawFacts.tool_calls.map(({ name, ok }) => ({ name, ok })),
  }

  return { session, timeline, messages, facts }
}
