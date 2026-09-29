import { NextResponse } from "next/server"
import { getAgentId, getApiKey, mintVoiceToken } from "@/lib/assemblyai"

export const runtime = "nodejs"

/**
 * Mints a single-use voice agent token and hands the client the agent id it
 * should bind to. The API key never reaches the browser.
 */
export async function GET() {
  if (!getApiKey()) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY is not set on the server." },
      { status: 503 }
    )
  }

  const agentId = getAgentId()
  if (!agentId) {
    return NextResponse.json(
      { error: "AGENT_ID_POST_MORTEM is not set. Run `npm run publish:agent`." },
      { status: 503 }
    )
  }

  try {
    const token = await mintVoiceToken()
    return NextResponse.json({ token, agentId })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to mint token." },
      { status: 502 }
    )
  }
}
