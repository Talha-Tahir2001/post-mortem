import type { ChecklistStepId, ServiceName, Severity } from "@/lib/types"

export const HTTP_TOOL = "get_recent_deploys" as const

export const CLIENT_TOOLS = [
  "check_service_health",
  "get_error_rate",
  "update_checklist",
  "add_action_item",
  "set_severity",
  "respond_freely",
] as const
export type ClientToolName = (typeof CLIENT_TOOLS)[number]

export function isClientTool(name: string): name is ClientToolName {
  return (CLIENT_TOOLS as readonly string[]).includes(name)
}

export interface CheckServiceHealthArgs {
  service: ServiceName
}

export interface GetErrorRateArgs {
  service: ServiceName
  window: "5m" | "1h"
}

export interface UpdateChecklistArgs {
  step: ChecklistStepId
  status: "done" | "in_progress" | "skipped"
}

export interface AddActionItemArgs {
  task: string
  owner?: string
}

export interface SetSeverityArgs {
  level: Severity
}

export type ToolArgs =
  | CheckServiceHealthArgs
  | GetErrorRateArgs
  | UpdateChecklistArgs
  | AddActionItemArgs
  | SetSeverityArgs
  | Record<string, never>

export const TOOL_LABELS: Record<string, string> = {
  get_recent_deploys: "GET /api/sim/deploys",
  check_service_health: "check_service_health()",
  get_error_rate: "get_error_rate()",
  update_checklist: "update_checklist()",
  add_action_item: "add_action_item()",
  set_severity: "set_severity()",
  respond_freely: "respond_freely()",
}
