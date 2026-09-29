const BASE = "https://agents.assemblyai.com"

/** Server-only AssemblyAI REST client. Never import from a client component. */

export function getApiKey(): string | null {
  const key = process.env.ASSEMBLYAI_API_KEY
  return key && key.trim() ? key.trim() : null
}

export function getAgentId(): string | null {
  const id = process.env.AGENT_ID_POST_MORTEM
  return id && id.trim() ? id.trim() : null
}

async function request<T>(pathname: string, init?: RequestInit): Promise<T> {
  const key = getApiKey()
  if (!key) throw new Error("ASSEMBLYAI_API_KEY is not set")

  const url = /^https?:\/\//.test(pathname) ? pathname : `${BASE}${pathname}`

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`AssemblyAI ${init?.method ?? "GET"} ${pathname} -> ${res.status}: ${body}`)
  }

  return (await res.json()) as T
}

export interface SessionSummary {
  id: string
  agent_id?: string
  status?: string
  duration_seconds?: number | null
  created_at?: string
  ended_at?: string | null
  public_close_reason?: string | null
}

interface SessionListResponse {
  sessions?: SessionSummary[]
  has_more?: boolean
  response_metadata?: { next_cursor?: string }
}

export async function listSessions(limit = 12): Promise<SessionSummary[]> {
  const data = await request<SessionListResponse>(
    `/v1/sessions?limit=${limit}${getAgentId() ? `&agent_id=${getAgentId()}` : ""}`
  )
  return data.sessions ?? []
}

export interface Artifact {
  type: string
  url: string
  content_type?: string
}

export interface SessionDetail extends SessionSummary {
  artifacts?: Artifact[]
  config?: Record<string, unknown>
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/v1/sessions/${encodeURIComponent(sessionId)}`)
}

export function artifactUrl(session: SessionDetail, type: string): string | null {
  return session.artifacts?.find((artifact) => artifact.type === type)?.url ?? null
}

export interface VoiceTokenResponse {
  token: string
}

/**
 * Mint a single-use token. `expires_in_seconds` is the redemption window
 * (1-600); `max_session_duration_seconds` caps how long the session may run
 * (60-10800). Fetch a fresh one on every connect, reconnects included.
 */
export async function mintVoiceToken(): Promise<string> {
  const url = new URL(`${BASE}/v1/token`)
  url.searchParams.set("expires_in_seconds", "300")
  url.searchParams.set("max_session_duration_seconds", "1800")

  const data = await request<VoiceTokenResponse>(url.toString())
  return data.token
}
