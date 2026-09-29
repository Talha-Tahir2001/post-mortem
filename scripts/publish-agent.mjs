#!/usr/bin/env node
/**
 * Upserts the stored agent from agents/post-mortem.jsonc and writes
 * AGENT_ID_POST_MORTEM back to .env.local (or .env).
 *
 *   node scripts/publish-agent.mjs
 *
 * Re-run this after changing APP_URL (localhost -> Vercel) so the HTTP tool
 * points at the deployment you are actually demoing.
 *
 * AssemblyAI only accepts https:// URLs for server-side HTTP tools, and it
 * blocks loopback/private hosts, so a localhost APP_URL publishes
 * `get_recent_deploys` as a *function* tool instead — the browser then answers
 * it from the same /api/sim/deploys endpoint. Re-run against a public https
 * APP_URL to get the server-side HTTP tool back.
 */
import { existsSync, readFileSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const AGENT_FILE = path.join(ROOT, "agents", "post-mortem.jsonc")
const ENV_FILES = [path.join(ROOT, ".env.local"), path.join(ROOT, ".env")]
const BASE = "https://agents.assemblyai.com"

function loadEnvFile(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

/** Strip full-line `//` comments so the .jsonc parses as strict JSON. */
function stripLineComments(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
}

function substituteVars(template) {
  return template.replace(/\$\{([A-Z0-9_]+)\}/g, (match, name) => {
    const value = process.env[name]
    if (!value) {
      throw new Error(`Missing ${name}. Set it in .env.local (or .env).`)
    }
    return value
  })
}

const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i

/**
 * Server-side HTTP tools require an https:// URL on a public host, so
 * localhost / LAN / http URLs cannot be used for the webhook.
 */
function publicHttpsUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return false
    if (PRIVATE_HOST.test(url.hostname)) return false
    if (/\.(local|internal|localhost)$/i.test(url.hostname)) return false
    return true
  } catch {
    return false
  }
}

/** HTTP tool -> function tool, so the browser answers it instead. */
function downgradeHttpTool(tool) {
  const { http, ...rest } = tool
  void http
  const description =
    typeof rest.description === "string"
      ? rest.description.replace(/^Server-side tool\.\s*/, "")
      : rest.description
  return {
    type: "function",
    ...rest,
    description,
    parameters: rest.parameters ?? { type: "object", properties: {}, required: [] },
  }
}

async function api(pathname, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: process.env.ASSEMBLYAI_API_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} -> ${res.status}\n${text}`)
  }
  return text ? JSON.parse(text) : null
}

function pickList(payload) {
  if (Array.isArray(payload)) return payload
  for (const key of ["agents", "data", "items", "results"]) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }
  return []
}

async function upsert(body) {
  const list = pickList(await api("/v1/agents?limit=100"))
  const existing = list.find((agent) => agent.name === body.name)
  if (existing) {
    const updated = await api(`/v1/agents/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    })
    return { id: updated?.id ?? existing.id, created: false }
  }
  const created = await api("/v1/agents", { method: "POST", body: JSON.stringify(body) })
  return { id: created?.id, created: true }
}

function envFileToWrite() {
  return ENV_FILES.find((file) => existsSync(file)) ?? ENV_FILES[1]
}

async function persistAgentId(id) {
  const file = envFileToWrite()
  let raw = existsSync(file) ? readFileSync(file, "utf8") : ""
  const line = `AGENT_ID_POST_MORTEM=${id}`
  if (/^AGENT_ID_POST_MORTEM=.*$/m.test(raw)) {
    raw = raw.replace(/^AGENT_ID_POST_MORTEM=.*$/m, line)
  } else {
    raw = raw.trimEnd() + (raw.trim() ? "\n" : "") + line + "\n"
  }
  await writeFile(file, raw, "utf8")
  return file
}

async function main() {
  ENV_FILES.forEach(loadEnvFile)

  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is not set. Add it to .env.local (or .env) first."
    )
  }
  process.env.APP_URL ??= "http://localhost:3000"

  const source = substituteVars(stripLineComments(await readFile(AGENT_FILE, "utf8")))
  const body = JSON.parse(source)

  const httpTools = (body.tools ?? []).filter((tool) => tool.http)
  const appUrlIsPublic = publicHttpsUrl(process.env.APP_URL)

  if (appUrlIsPublic) {
    for (const tool of httpTools) {
      if (!/^https:\/\//.test(tool.http.url)) {
        throw new Error(`HTTP tool "${tool.name}" resolved to a non-https URL.`)
      }
    }
  } else {
    body.tools = (body.tools ?? []).map((tool) => (tool.http ? downgradeHttpTool(tool) : tool))
  }

  const { id, created } = await upsert(body)
  if (!id) throw new Error("AssemblyAI did not return an agent id.")

  const envFile = await persistAgentId(id)

  console.log(`${created ? "Created" : "Updated"} agent "${body.name}"`)
  console.log(`  id       ${id}`)
  console.log(`  app url  ${process.env.APP_URL}`)
  if (!appUrlIsPublic) {
    console.log("")
    console.log("  NOTE: APP_URL is not a public https URL, and AssemblyAI rejects")
    console.log("  http:// and loopback hosts for HTTP tools.")
    console.log(`  ${httpTools.map((tool) => tool.name).join(", ") || "The HTTP tool"} published as a`)
    console.log("  FUNCTION tool — the browser answers it from /api/sim/deploys.")
    console.log("  Re-run with APP_URL=https://<public-host> after deploying to restore")
    console.log("  the server-side HTTP tool.")
    console.log("")
  }
  console.log(`  AGENT_ID_POST_MORTEM written to ${path.basename(envFile)}`)
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exitCode = 1
})
