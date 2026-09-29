import { NextRequest, NextResponse } from "next/server"
import { loadSessionTimeline } from "@/lib/session-timeline"

export const runtime = "nodejs"
export const maxDuration = 30

/** Full session transcript (user / agent / tool) for the report page. */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim() || null
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required." }, { status: 400 })
  }

  const { messages, facts } = await loadSessionTimeline(sessionId)
  return NextResponse.json({ sessionId, messages, facts })
}
