import {
  POSTMORTEM_JSON_SCHEMA,
  type Postmortem,
} from "@/lib/postmortem-schema"

const GATEWAY_BASE = "https://llm-gateway.assemblyai.com/v1"
const DEFAULT_MODEL = "gemini-3.8-flash"

interface GatewayConfig {
  baseUrl: string
  chatUrl: string
  apiKey: string
  isGateway: boolean
  model: string
}

/**
 * AssemblyAI's LLM Gateway by default. Override with LLM_BASE_URL /
 * LLM_API_KEY to use any other OpenAI-compatible provider (OpenAI, OpenRouter,
 * Groq, a local server) when the account has no Gateway access.
 */
export function getGatewayConfig(): GatewayConfig {
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || GATEWAY_BASE).replace(/\/+$/, "")
  const isGateway = /llm-gateway\.(eu\.)?assemblyai\.com/.test(baseUrl)
  const apiKey = (
    process.env.LLM_API_KEY?.trim() ||
    process.env.ASSEMBLYAI_API_KEY?.trim() ||
    ""
  ).trim()

  return {
    baseUrl,
    chatUrl: `${baseUrl}/chat/completions`,
    apiKey,
    isGateway,
    model: process.env.POSTMORTEM_MODEL?.trim() || DEFAULT_MODEL,
  }
}

export function getModel(): string {
  return getGatewayConfig().model
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[]
}

interface ErrorBody {
  message?: string
  metadata?: { errors?: string[] }
}

function describeFailure(status: number, raw: string, config: GatewayConfig): string {
  let detail = raw.slice(0, 400)
  try {
    const parsed = JSON.parse(raw) as ErrorBody
    detail = parsed.metadata?.errors?.[0] ?? parsed.message ?? detail
  } catch {
    /* keep the raw body */
  }

  if (/does not have access/i.test(detail)) {
    return (
      `Your AssemblyAI account has no LLM Gateway access (${config.model}). ` +
      "Set LLM_BASE_URL and LLM_API_KEY to an OpenAI-compatible provider, or enable the LLM Gateway on your plan."
    )
  }
  return `LLM ${config.baseUrl} -> ${status}: ${detail}`
}

/**
 * OpenAI-compatible chat completion with structured outputs (JSON schema).
 * `post_processing_steps` is a Gateway extension, so it is only sent there.
 */
export async function structuredPostmortem(input: {
  system: string
  user: string
  model?: string
  signal?: AbortSignal
}): Promise<Postmortem> {
  const config = getGatewayConfig()
  if (!config.apiKey) throw new Error("No LLM API key is configured.")

  const res = await fetch(config.chatUrl, {
    method: "POST",
    headers: {
      // The Gateway takes the raw key; every other provider wants a Bearer.
      Authorization: config.isGateway ? config.apiKey : `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: input.signal,
    body: JSON.stringify({
      model: input.model ?? config.model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "postmortem",
          schema: POSTMORTEM_JSON_SCHEMA,
          strict: true,
        },
      },
      ...(config.isGateway ? { post_processing_steps: [{ type: "json-repair" }] } : {}),
    }),
    cache: "no-store",
  })

  const raw = await res.text()
  if (!res.ok) throw new Error(describeFailure(res.status, raw, config))

  let payload: ChatResponse
  try {
    payload = JSON.parse(raw) as ChatResponse
  } catch {
    throw new Error(`LLM ${config.baseUrl} returned a non-JSON body.`)
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error("LLM returned no content")

  const parsed = JSON.parse(content) as Postmortem
  if (!parsed.summary || !Array.isArray(parsed.timeline)) {
    throw new Error("LLM response did not match the postmortem schema")
  }
  return parsed
}
