export const SERVICES = ["checkout", "api", "web"] as const
export type ServiceName = (typeof SERVICES)[number]

export type Severity = "SEV1" | "SEV2" | "SEV3"

export type ServiceHealth = "healthy" | "degraded" | "failing"

export interface ServiceState {
  status: ServiceHealth
  http_code: number
  p95_ms: number
  error_pct: number
}

export const CHECKLIST_STEPS = [
  "declare_sev",
  "check_health",
  "identify_change",
  "status_page",
  "rollback",
  "monitor",
  "resolve",
] as const
export type ChecklistStepId = (typeof CHECKLIST_STEPS)[number]

export type ChecklistStatus = "pending" | "in_progress" | "done" | "skipped"

export interface ChecklistStep {
  id: ChecklistStepId
  label: string
  hint: string
}

export const CHECKLIST: ChecklistStep[] = [
  { id: "declare_sev", label: "Declare severity", hint: "SEV1 / SEV2 / SEV3 agreed out loud" },
  { id: "check_health", label: "Check service health", hint: "Status codes and p95 for the blast radius" },
  { id: "identify_change", label: "Identify the change", hint: "What shipped, who shipped it, when" },
  { id: "status_page", label: "Update the status page", hint: "Customers know before they tweet" },
  { id: "rollback", label: "Roll back the bad change", hint: "Revert, then verify" },
  { id: "monitor", label: "Monitor recovery", hint: "Error rate and p95 trending down" },
  { id: "resolve", label: "Resolve", hint: "Declare it over, then write the postmortem" },
]

export interface ActionItem {
  id: string
  task: string
  owner: string
}

export interface Deploy {
  service: ServiceName
  hash: string
  message: string
  author: string
  minutesAgo: number
  env: "prod" | "staging"
}

export interface ToolLogEntry {
  id: string
  name: string
  ok: boolean
  at: number
  detail?: string
}

export interface IncidentState {
  severity: Severity | null
  checklist: Record<ChecklistStepId, ChecklistStatus>
  actionItems: ActionItem[]
  services: Record<ServiceName, ServiceState>
  chaos: boolean
  toolLog: ToolLogEntry[]
}

export function createIncidentState(
  services: Record<ServiceName, ServiceState>
): IncidentState {
  return {
    severity: null,
    checklist: Object.fromEntries(
      CHECKLIST_STEPS.map((step) => [step, "pending"])
    ) as Record<ChecklistStepId, ChecklistStatus>,
    actionItems: [],
    services,
    chaos: false,
    toolLog: [],
  }
}

export const SEVERITY_META: Record<
  Severity,
  { label: string; className: string; dotClassName: string }
> = {
  SEV1: {
    label: "SEV1",
    className: "bg-destructive/15 text-destructive ring-destructive/30",
    dotClassName: "bg-destructive",
  },
  SEV2: {
    label: "SEV2",
    className: "bg-amber-500/15 text-amber-500 ring-amber-500/30",
    dotClassName: "bg-amber-500",
  },
  SEV3: {
    label: "SEV3",
    className: "bg-sky-500/15 text-sky-500 ring-sky-500/30",
    dotClassName: "bg-sky-500",
  },
}

export const HEALTH_META: Record<
  ServiceHealth,
  { label: string; textClassName: string; dotClassName: string }
> = {
  healthy: {
    label: "healthy",
    textClassName: "text-emerald-500",
    dotClassName: "bg-emerald-500",
  },
  degraded: {
    label: "degraded",
    textClassName: "text-amber-500",
    dotClassName: "bg-amber-500",
  },
  failing: {
    label: "failing",
    textClassName: "text-destructive",
    dotClassName: "bg-destructive",
  },
}
