import type { IncidentFacts, Postmortem } from "@/lib/postmortem-schema"
import type { ActionItem, Severity } from "@/lib/types"

export interface PostmortemRequestBody {
  sessionId: string
  title: string
  severity: Severity | null
  actionItems: ActionItem[]
}

export interface PostmortemResponse {
  facts: IncidentFacts
  postmortem: Postmortem
  source: "llm" | "fallback"
  source_detail?: string
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Ask the server for the structured postmortem. Artifacts take a moment to
 * appear after `session.ended`, so if the first attempt comes back with an
 * empty transcript we wait and ask once more.
 */
export async function requestPostmortem(
  body: PostmortemRequestBody,
  attempts = 2
): Promise<PostmortemResponse> {
  let last: PostmortemResponse | null = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await delay(4000)

    const response = await fetch("/api/postmortem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(payload.error ?? `Postmortem request failed (${response.status})`)
    }

    last = (await response.json()) as PostmortemResponse
    if (last.facts.turn_count > 0) return last
  }

  if (!last) throw new Error("Postmortem request failed.")
  return last
}
