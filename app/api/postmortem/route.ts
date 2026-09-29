import { NextRequest, NextResponse } from "next/server"
import { getApiKey } from "@/lib/assemblyai"
import { structuredPostmortem } from "@/lib/llm-gateway"
import type { IncidentFacts, Postmortem } from "@/lib/postmortem-schema"
import { loadSessionTimeline } from "@/lib/session-timeline"
import type { TimelineMessage } from "@/lib/timeline"
import type { ActionItem, Severity } from "@/lib/types"
import { CHECKLIST } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 60

interface PostmortemRequest {
  sessionId?: string | null
  incidentId?: string
  title?: string
  severity?: Severity | null
  actionItems?: ActionItem[]
}

const SYSTEM_PROMPT = `You write postmortems for engineering incidents. Your input is the raw
transcript of a voice triage call plus hard facts measured from the session.

Rules:
- Only use facts that appear in the transcript or in the MEASURED FACTS block. Never invent
  error rates, deploy hashes, HTTP codes, timestamps or durations. Anything not proven by a
  tool call in the transcript is a hypothesis, not a fact.
- The severity and action items provided by the client are the source of truth: copy them
  verbatim into the report (you may add extra action items the transcript clearly implies).
- Timeline entries must be ordered, terse, and use relative times like +00:00 from the start
  of the call when no clock time was spoken.
- Root causes are explicitly hypotheses unless a tool result in the transcript proves them.
- Keep every field in plain engineering prose. No markdown inside strings, no emoji.
- went_well / went_poorly: 2-4 concrete observations about the response itself, not the code.`

function renderTranscript(messages: TimelineMessage[]): string {
  if (!messages.length) return "(the transcript was empty)"
  return messages
    .map((message) => {
      if (message.role === "tool") {
        const args = message.arguments ? JSON.stringify(message.arguments) : "{}"
        const result = (message.result ?? "").slice(0, 400)
        return `tool: ${message.name}(${args}) -> ${message.error ? "ERROR " : ""}${result}`
      }
      const who = message.role === "user" ? "RESPONDER" : "AGENT"
      return `${who}: ${message.text}`
    })
    .join("\n")
}

/** Offline report builder: everything below is derived from tool results and
 * measured facts in the transcript — never from a model. */
function parseResult(message: TimelineMessage): Record<string, unknown> | null {
  if (!message.result) return null
  try {
    const parsed: unknown = JSON.parse(message.result)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined
}

function num(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined
}

function formatOffset(at: number | null | undefined, start: number | null): string {
  if (typeof at !== "number" || start === null) return "+00:00"
  const seconds = Math.max(0, Math.round((at - start) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `+${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

function briefArgs(message: TimelineMessage): string {
  const args = message.arguments ?? {}
  return Object.entries(args)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ")
}

function toolOutcome(message: TimelineMessage): string {
  const data = parseResult(message)
  if (!data) return "ran"
  switch (message.name) {
    case "check_service_health": {
      const parts = [str(data.status), num(data.http_code) && `HTTP ${num(data.http_code)}`]
      const p95 = num(data.p95_ms)
      if (p95) parts.push(`p95 ${p95}ms`)
      return parts.filter(Boolean).join(", ") || "ran"
    }
    case "get_error_rate": {
      const pct = num(data.error_pct)
      return pct ? `${pct}% errors (${String(data.window ?? "5m")})` : "ran"
    }
    case "get_recent_deploys": {
      const deploys = Array.isArray(data.deploys) ? data.deploys : []
      const latest = deploys[0] as Record<string, unknown> | undefined
      const hash = latest ? (str(latest.hash) ?? str(latest.id) ?? "").slice(0, 7) : ""
      return `${deploys.length} deploys${hash ? `, latest ${hash}` : ""}`
    }
    case "set_severity":
      return String(data.level ?? "recorded")
    case "update_checklist":
      return `${String(data.step ?? "step")} → ${String(data.status ?? "updated")}`
    case "add_action_item":
      return str(data.task) ?? "added"
    default:
      return "ran"
  }
}

interface DerivedState {
  hypotheses: string[]
  impact: string
  wentWell: string[]
  wentPoorly: string[]
}

function deriveFromTranscript(
  messages: TimelineMessage[],
  severity: Severity
): DerivedState {
  const tools = messages.filter((message) => message.role === "tool")
  const failedTools = tools.filter((message) => message.error)

  const checklist: Partial<Record<string, string>> = {}
  for (const message of tools) {
    if (message.name !== "update_checklist") continue
    const step = str(message.arguments?.step)
    const status = str(message.arguments?.status)
    if (step && status) checklist[step] = status
  }

  const openSteps = CHECKLIST.filter((step) => {
    const status = checklist[step.id] ?? "pending"
    return status === "pending" || status === "in_progress"
  })
  const skippedSteps = CHECKLIST.filter((step) => checklist[step.id] === "skipped")
  const closedSteps = CHECKLIST.filter((step) => checklist[step.id] === "done")

  // --- hypotheses, from tool results only ---
  const hypotheses: string[] = []
  let rollbackDone = false
  for (const message of tools) {
    if (!message.error && message.name === "update_checklist") {
      if (
        str(message.arguments?.step) === "rollback" &&
        str(message.arguments?.status) === "done"
      ) {
        rollbackDone = true
      }
    }
    if (message.error) continue
    const data = parseResult(message)
    if (!data) continue

    if (message.name === "get_recent_deploys") {
      const deploys = Array.isArray(data.deploys) ? (data.deploys as Record<string, unknown>[]) : []
      const latest = deploys[0]
      if (latest) {
        const service = str(data.service) ?? "the service"
        const hash = (str(latest.hash) ?? str(latest.id) ?? "unknown").slice(0, 7)
        const note = str(latest.message) ? `"${str(latest.message)}"` : "no message recorded"
        hypotheses.push(
          `Most recent ${service} deploy ${hash} ${note} is the only change on record before this incident — leading suspect until a rollback is verified with a clean health check.`
        )
      }
    }

    if (message.name === "check_service_health") {
      const status = str(data.status)
      if (status === "failing" || status === "degraded") {
        const service = str(data.service) ?? "the service"
        const parts = [
          num(data.http_code) && `HTTP ${num(data.http_code)}`,
          num(data.p95_ms) && `p95 ${num(data.p95_ms)}ms`,
          num(data.error_pct) && `${num(data.error_pct)}% errors`,
        ].filter(Boolean)
        hypotheses.push(
          `${service} was measurably ${status} during the call (${parts.join(", ")}) — the fault was live, not a false alarm.`
        )
      }
    }

    if (message.name === "get_error_rate" && num(data.error_pct)) {
      const service = str(data.service) ?? "the service"
      hypotheses.push(
        `${service} error rate sampled at ${num(data.error_pct)}% over the ${String(data.window ?? "5m")} window while the incident was open.`
      )
    }
  }

  const lastHealthResult = [...tools]
    .reverse()
    .find((message) => message.name === "check_service_health" && !message.error)
  if (rollbackDone && lastHealthResult) {
    const health = parseResult(lastHealthResult)
    if (health && str(health.status) === "healthy") {
      hypotheses.push(
        "The rollback was completed on the call and the follow-up health check came back healthy — consistent with the deploy being the trigger, though not proof of cause."
      )
    }
  }

  const uniqueHypotheses = [...new Set(hypotheses)].slice(0, 3)
  if (!uniqueHypotheses.length) {
    uniqueHypotheses.push(
      `No tool result on this call proved a cause. The ${severity} rating came from the responder's assessment; root cause was not established during the conversation.`
    )
  }

  // --- impact ---
  const lastHealth = [...tools]
    .reverse()
    .find((message) => message.name === "check_service_health" && !message.error)
  const healthData = lastHealth ? parseResult(lastHealth) : null
  let impact = "Not recorded during the call — fill in before sharing."
  if (healthData && str(healthData.service)) {
    const service = str(healthData.service)
    const measured = [
      str(healthData.http_code) ? `HTTP ${str(healthData.http_code)}` : "",
      num(healthData.p95_ms) ? `p95 ${num(healthData.p95_ms)}ms` : "",
      num(healthData.error_pct) ? `${num(healthData.error_pct)}% errors` : "",
    ].filter(Boolean)

    if (str(healthData.status) === "healthy") {
      impact =
        `The final health check on the call reported ${service} healthy (${measured.join(", ")}), ` +
        "so no failing state was captured by tooling. No customer-facing impact figures were recorded — add blast radius before sharing."
    } else {
      impact =
        `${service} was returning ${measured.join(", ") || str(healthData.status)} when measured on the call. ` +
        "No customer-facing impact figures were recorded — add blast radius before sharing."
    }
  }

  // --- what went well / poorly ---
  const wentWell: string[] = []
  if (tools.length && !failedTools.length) {
    wentWell.push(
      `${tools.length} tool calls returned data with no failures, so every number quoted on the call came from a tool.`
    )
  }
  if (closedSteps.length === CHECKLIST.length) {
    wentWell.push("The triage checklist was walked in order and fully closed on the call.")
  } else if (closedSteps.length > 0) {
    wentWell.push(
      `${closedSteps.length} of ${CHECKLIST.length} checklist steps were confirmed complete during the call.`
    )
  }
  if (messageCount(messages, "agent") > 0 && messageCount(messages, "user") > 0) {
    wentWell.push(
      "The responder answered each question the agent asked, so severity and state were never guessed."
    )
  }
  if (!wentWell.length) wentWell.push("No positive observations were recorded for this call.")

  const wentPoorly: string[] = []
  if (failedTools.length) {
    const names = [...new Set(failedTools.map((message) => message.name ?? "tool"))].join(", ")
    wentPoorly.push(`${failedTools.length} tool call(s) failed: ${names}.`)
  }
  if (openSteps.length) {
    wentPoorly.push(
      `${openSteps.length} checklist step(s) were never closed: ${openSteps
        .map((step) => step.label.toLowerCase())
        .join(", ")}.`
    )
  }
  if (skippedSteps.length) {
    wentPoorly.push(
      `${skippedSteps.length} checklist step(s) were skipped: ${skippedSteps
        .map((step) => step.label.toLowerCase())
        .join(", ")}.`
    )
  }
  const capturedItems = tools.filter((message) => message.name === "add_action_item")
  if (!capturedItems.length) {
    wentPoorly.push("No follow-up action items were captured before the call ended.")
  }
  if (!wentPoorly.length) wentPoorly.push("No negative observations were recorded for this call.")

  return { hypotheses: uniqueHypotheses, impact, wentWell, wentPoorly }
}

function messageCount(messages: TimelineMessage[], role: TimelineMessage["role"]): number {
  return messages.filter((message) => message.role === role).length
}

function fallbackPostmortem(input: {
  title: string
  severity: Severity
  actionItems: ActionItem[]
  messages: TimelineMessage[]
  facts: IncidentFacts
}): Postmortem {
  const derived = deriveFromTranscript(input.messages, input.severity)
  const start = input.messages.find((message) => typeof message.at === "number")?.at ?? null

  // Timeline marks are sparse: carry the last known timestamp forward so
  // messages without their own stamp never collapse to +00:00.
  let carried: number | null = start
  const timeline = input.messages.slice(0, 40).map((message) => {
    if (typeof message.at === "number") carried = message.at
    const at = carried
    return {
      when: formatOffset(at, start),
      event:
        message.role === "tool"
          ? `${message.name}(${briefArgs(message)}) → ${
              message.error ? "failed" : toolOutcome(message)
            }`
          : (message.text ?? "").slice(0, 200),
      actor: message.role,
    }
  })

  const firstReport = input.messages.find(
    (message) => message.role === "user" && message.text
  )?.text

  const duration = input.facts.duration_seconds ?? 0
  const minutes = Math.floor(duration / 60)
  const seconds = Math.round(duration % 60)
  const durationText = minutes
    ? `${minutes}m ${seconds}s`
    : `${seconds}s`

  const summary = [
    `${input.severity} incident triaged over a ${durationText} voice call ` +
      `across ${input.facts.turn_count} turns and ${input.facts.tool_calls.length} tool calls.`,
    firstReport ? `The responder opened with: "${firstReport.slice(0, 180)}"` : "",
  ]
    .filter(Boolean)
    .join(" ")

  return {
    title: input.title,
    severity: input.severity,
    summary,
    impact: derived.impact,
    timeline,
    root_cause_hypotheses: derived.hypotheses,
    action_items: input.actionItems.map((item) => ({
      task: item.task,
      owner: item.owner || null,
    })),
    went_well: derived.wentWell,
    went_poorly: derived.wentPoorly,
  }
}

function mergeActionItems(
  clientItems: ActionItem[],
  modelItems: Postmortem["action_items"]
): Postmortem["action_items"] {
  const merged: Postmortem["action_items"] = clientItems.map((item) => ({
    task: item.task,
    owner: item.owner || null,
  }))
  const seen = new Set(merged.map((item) => item.task.trim().toLowerCase()))

  for (const item of modelItems) {
    const key = item.task.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({ task: item.task, owner: item.owner ?? null })
  }
  return merged
}

export async function POST(request: NextRequest) {
  let body: PostmortemRequest
  try {
    body = (await request.json()) as PostmortemRequest
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const sessionId = body.sessionId?.trim() || null
  const severity: Severity = body.severity ?? "SEV3"
  const actionItems = Array.isArray(body.actionItems) ? body.actionItems : []
  const title = body.title?.trim() || "Untitled incident"

  const { messages, facts } = await loadSessionTimeline(sessionId)

  const contextLines = [
    `INCIDENT TITLE: ${title}`,
    `SEVERITY (source of truth): ${severity}`,
    `ACTION ITEMS CAPTURED DURING THE CALL (source of truth):`,
    actionItems.length
      ? actionItems
          .map((item, index) => `  ${index + 1}. ${item.task}${item.owner ? ` (owner: ${item.owner})` : ""}`)
          .join("\n")
      : "  (none)",
    "",
    "MEASURED FACTS (from the session record):",
    `  duration_seconds: ${facts.duration_seconds ?? "unknown"}`,
    `  turns: ${facts.turn_count} (${facts.user_turn_count} responder, ${facts.agent_turn_count} agent)`,
    `  median time_to_first_audio_ms: ${facts.time_to_first_audio_ms ?? "unknown"}`,
    `  tool calls: ${
      facts.tool_calls.length
        ? facts.tool_calls.map((call) => `${call.name}${call.ok ? "" : " (error)"}`).join(", ")
        : "none"
    }`,
    "",
    "TRANSCRIPT:",
    renderTranscript(messages),
  ].join("\n")

  let postmortem: Postmortem
  let source: "llm" | "fallback" = "llm"
  let sourceDetail: string | undefined

  try {
    if (!getApiKey()) throw new Error("ASSEMBLYAI_API_KEY is not set")
    if (!messages.length) throw new Error("no transcript available for this session")

    postmortem = await structuredPostmortem({
      system: SYSTEM_PROMPT,
      user: contextLines,
    })
  } catch (error) {
    source = "fallback"
    sourceDetail =
      error instanceof Error ? error.message : "structured generation failed"
    console.error("[postmortem] structured generation failed:", error)
    postmortem = fallbackPostmortem({
      title,
      severity,
      actionItems,
      messages,
      facts,
    })
  }

  postmortem.severity = severity
  postmortem.title = title || postmortem.title
  postmortem.action_items = mergeActionItems(actionItems, postmortem.action_items ?? [])

  return NextResponse.json({
    facts,
    postmortem,
    source,
    ...(sourceDetail ? { source_detail: sourceDetail } : {}),
  })
}
