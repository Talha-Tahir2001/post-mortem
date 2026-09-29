import type { ActionItem, ChecklistStepId, ChecklistStatus, Severity } from "@/lib/types"
import type { IncidentFacts, Postmortem } from "@/lib/postmortem-schema"

/** localStorage is the only datastore: no DB, per PLAN.MD §3. */

export interface IncidentSnapshot {
  incidentId: string
  title: string
  startedAt: number
  endedAt?: number
  sessionId?: string | null
  severity: Severity | null
  actionItems: ActionItem[]
  checklist?: Partial<Record<ChecklistStepId, ChecklistStatus>>
}

export interface CachedReport {
  facts: IncidentFacts
  postmortem: Postmortem
  cachedAt: number
  source?: "llm" | "fallback"
  source_detail?: string
}

const PREFIX = "pm"

export const storageKeys = {
  incident: (id: string) => `${PREFIX}:incident:${id}`,
  report: (sessionId: string) => `${PREFIX}:report:${sessionId}`,
  reportContext: (sessionId: string) => `${PREFIX}:ctx:${sessionId}`,
}

export function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota or private mode — the app still works without the cache
  }
}

export function saveIncident(snapshot: IncidentSnapshot) {
  writeJSON(storageKeys.incident(snapshot.incidentId), snapshot)
}

export function loadIncident(incidentId: string): IncidentSnapshot | null {
  return readJSON<IncidentSnapshot>(storageKeys.incident(incidentId))
}

export function saveReport(sessionId: string, report: CachedReport) {
  writeJSON(storageKeys.report(sessionId), report)
}

export function loadReport(sessionId: string): CachedReport | null {
  return readJSON<CachedReport>(storageKeys.report(sessionId))
}

export interface ReportContext {
  title: string
  severity: Severity | null
  actionItems: ActionItem[]
}

export function saveReportContext(sessionId: string, context: ReportContext) {
  writeJSON(storageKeys.reportContext(sessionId), context)
}

export function loadReportContext(sessionId: string): ReportContext | null {
  return readJSON<ReportContext>(storageKeys.reportContext(sessionId))
}
