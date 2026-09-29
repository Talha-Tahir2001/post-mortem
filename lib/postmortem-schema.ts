/** JSON schema for the LLM Gateway structured output + the matching TS types. */

export type Severity = "SEV1" | "SEV2" | "SEV3"

export interface PostmortemTimelineEntry {
  when: string
  event: string
  actor: "user" | "agent" | "tool"
}

export interface PostmortemActionItem {
  task: string
  owner: string | null
}

export interface Postmortem {
  title: string
  severity: Severity
  summary: string
  impact: string
  timeline: PostmortemTimelineEntry[]
  root_cause_hypotheses: string[]
  action_items: PostmortemActionItem[]
  went_well: string[]
  went_poorly: string[]
}

export const POSTMORTEM_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "One-line incident title, e.g. 'Checkout returning 502s after deploy a1b9f3e'.",
    },
    severity: { type: "string", enum: ["SEV1", "SEV2", "SEV3"] },
    summary: {
      type: "string",
      description: "2-3 sentences: what broke, when, and how it was mitigated.",
    },
    impact: {
      type: "string",
      description: "Who and what was affected — customers, revenue path, internal teams.",
    },
    timeline: {
      type: "array",
      description: "Chronological incident timeline built only from the call.",
      items: {
        type: "object",
        properties: {
          when: {
            type: "string",
            description: "Relative time ('+02:14') or clock time if the call gave one.",
          },
          event: { type: "string", description: "What happened, one clause." },
          actor: { type: "string", enum: ["user", "agent", "tool"] },
        },
        required: ["when", "event", "actor"],
        additionalProperties: false,
      },
    },
    root_cause_hypotheses: {
      type: "array",
      items: { type: "string" },
      description: "Ranked hypotheses, explicitly marked as unconfirmed unless a tool proved it.",
    },
    action_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          task: { type: "string" },
          owner: { type: ["string", "null"] },
        },
        required: ["task", "owner"],
        additionalProperties: false,
      },
    },
    went_well: { type: "array", items: { type: "string" } },
    went_poorly: { type: "array", items: { type: "string" } },
  },
  required: [
    "title",
    "severity",
    "summary",
    "impact",
    "timeline",
    "root_cause_hypotheses",
    "action_items",
    "went_well",
    "went_poorly",
  ],
  additionalProperties: false,
} as const

export interface IncidentFacts {
  session_id: string | null
  duration_seconds: number | null
  turn_count: number
  user_turn_count: number
  agent_turn_count: number
  time_to_first_audio_ms: number | null
  tool_calls: { name: string; ok: boolean }[]
}
