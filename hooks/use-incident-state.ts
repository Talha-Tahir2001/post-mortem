"use client"

import { useCallback, useRef, useState } from "react"
import {
  CHECKLIST_STEPS,
  createIncidentState,
  type ActionItem,
  type ChecklistStepId,
  type ChecklistStatus,
  type IncidentState,
  type ServiceName,
  type Severity,
} from "@/lib/types"
import { errorRateFor, servicesForChaos } from "@/lib/sim"
import {
  isClientTool,
  type AddActionItemArgs,
  type CheckServiceHealthArgs,
  type GetErrorRateArgs,
  type SetSeverityArgs,
  type UpdateChecklistArgs,
} from "@/lib/tools"

export interface ToolOutcome {
  ok: boolean
  result: Record<string, unknown>
}

let sequence = 0
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${sequence++}`

function clampPercent(value: number) {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10
}

/**
 * Holds everything the war room renders: severity, triage checklist, action
 * items, live service health and the chaos switch. Every client-side tool the
 * voice agent calls runs through `executeTool`, so the panels move while the
 * agent is still talking.
 */
export function useIncidentState() {
  const [state, setState] = useState<IncidentState>(() =>
    createIncidentState(servicesForChaos(false))
  )
  const stateRef = useRef(state)

  const commit = useCallback((next: IncidentState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const logTool = useCallback(
    (current: IncidentState, name: string, ok: boolean, detail?: string): IncidentState => ({
      ...current,
      toolLog: [
        { id: nextId("tool"), name, ok, at: Date.now(), detail },
        ...current.toolLog,
      ].slice(0, 40),
    }),
    []
  )

  const setChaos = useCallback(
    (active: boolean) => {
      const current = stateRef.current
      const services = servicesForChaos(active)
      commit({
        ...current,
        chaos: active,
        services: {
          ...current.services,
          checkout: services.checkout,
        },
      })
    },
    [commit]
  )

  const setSeverity = useCallback(
    (level: Severity) => {
      commit({ ...stateRef.current, severity: level })
    },
    [commit]
  )

  const addManualActionItem = useCallback(
    (task: string, owner?: string) => {
      const current = stateRef.current
      const item: ActionItem = { id: nextId("act"), task, owner: owner?.trim() || "Unassigned" }
      commit({ ...current, actionItems: [...current.actionItems, item] })
    },
    [commit]
  )

  const hydrate = useCallback(
    (patch: {
      severity?: Severity | null
      actionItems?: ActionItem[]
      checklist?: Partial<Record<ChecklistStepId, ChecklistStatus>>
    }) => {
      const current = stateRef.current
      commit({
        ...current,
        severity: patch.severity ?? current.severity,
        actionItems: patch.actionItems ?? current.actionItems,
        checklist: { ...current.checklist, ...(patch.checklist ?? {}) },
      })
    },
    [commit]
  )

  /**
   * Demo shortcut: puts the room into a believable mid-incident state so the
   * panels are worth looking at before a call is opened.
   */
  const seedDemoScenario = useCallback(() => {
    const now = Date.now()
    commit({
      severity: "SEV1",
      checklist: {
        declare_sev: "done",
        check_health: "done",
        identify_change: "in_progress",
        status_page: "pending",
        rollback: "pending",
        monitor: "pending",
        resolve: "pending",
      },
      actionItems: [
        { id: nextId("act"), task: "Roll back checkout deploy a1b9f3e", owner: "Priya" },
        { id: nextId("act"), task: "Replay failed carts after rollback", owner: "Dev" },
      ],
      services: servicesForChaos(true),
      chaos: true,
      toolLog: [
        {
          id: nextId("tool"),
          name: "get_recent_deploys",
          ok: true,
          at: now,
          detail: "checkout: 5 deploys",
        },
        {
          id: nextId("tool"),
          name: "check_service_health",
          ok: true,
          at: now - 6000,
          detail: "checkout: 502",
        },
        {
          id: nextId("tool"),
          name: "set_severity",
          ok: true,
          at: now - 12000,
          detail: "SEV1",
        },
      ],
    })
  }, [commit])

  const executeTool = useCallback(
    async (name: string, args: Record<string, unknown>): Promise<ToolOutcome> => {
      const current = stateRef.current

      // get_recent_deploys is an HTTP tool on the stored agent (server-side).
      // When the agent was published without a public https APP_URL it is
      // downgraded to a function tool instead, so the browser answers it.
      if (name === "get_recent_deploys") {
        const service = typeof args.service === "string" ? args.service : undefined
        try {
          const query = service ? `?service=${encodeURIComponent(service)}` : ""
          const res = await fetch(`/api/sim/deploys${query}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const payload = (await res.json()) as { service?: string; deploys?: unknown[] }
          commit(
            logTool(
              stateRef.current,
              name,
              true,
              `${payload.service ?? service ?? "all"}: ${payload.deploys?.length ?? 0} deploys`
            )
          )
          return { ok: true, result: payload as Record<string, unknown> }
        } catch (error) {
          const message = error instanceof Error ? error.message : "request failed"
          commit(logTool(stateRef.current, name, false, message))
          return { ok: false, result: { error: `Could not fetch deploys: ${message}` } }
        }
      }

      if (!isClientTool(name)) {
        return { ok: false, result: { error: `Unknown tool '${name}'.` } }
      }

      try {
        switch (name) {
          case "check_service_health": {
            const { service } = args as unknown as CheckServiceHealthArgs
            const serviceState = current.services[service]
            if (!serviceState) {
              return { ok: false, result: { error: `Unknown service '${service}'. Use checkout, api or web.` } }
            }
            const result = {
              service,
              status: serviceState.status,
              http_code: serviceState.http_code,
              p95_ms: serviceState.p95_ms,
              error_pct: serviceState.error_pct,
              simulated_failure: current.chaos,
            }
            commit(logTool(current, name, true, `${service}: ${serviceState.http_code}`))
            return { ok: true, result }
          }

          case "get_error_rate": {
            const { service, window } = args as unknown as GetErrorRateArgs
            const serviceState = current.services[service]
            if (!serviceState) {
              return { ok: false, result: { error: `Unknown service '${service}'. Use checkout, api or web.` } }
            }
            const error_pct = clampPercent(errorRateFor(serviceState, window))
            const result = { service, window, error_pct, unit: "percent" }
            commit(logTool(current, name, true, `${service} ${window}: ${error_pct}%`))
            return { ok: true, result }
          }

          case "update_checklist": {
            const { step, status } = args as unknown as UpdateChecklistArgs
            if (!(CHECKLIST_STEPS as readonly string[]).includes(step)) {
              return { ok: false, result: { error: `Unknown checklist step '${step}'.` } }
            }
            const nextStatus: ChecklistStatus = status
            const checklist = { ...current.checklist, [step]: nextStatus }
            commit(logTool({ ...current, checklist }, name, true, `${step}: ${nextStatus}`))
            return { ok: true, result: { step, status: nextStatus, checklist } }
          }

          case "add_action_item": {
            const args_ = args as unknown as AddActionItemArgs
            const task = args_.task?.trim()
            if (!task) return { ok: false, result: { error: "Task text is required." } }
            const item: ActionItem = {
              id: nextId("act"),
              task,
              owner: args_.owner?.trim() || "Unassigned",
            }
            const actionItems = [...current.actionItems, item]
            commit(logTool({ ...current, actionItems }, name, true, item.task))
            return { ok: true, result: { ...item, action_items: actionItems } }
          }

          case "set_severity": {
            const { level } = args as unknown as SetSeverityArgs
            if (!["SEV1", "SEV2", "SEV3"].includes(level)) {
              return { ok: false, result: { error: `Unknown severity '${level}'.` } }
            }
            commit(logTool({ ...current, severity: level }, name, true, level))
            return { ok: true, result: { level, severity: level } }
          }

          case "respond_freely":
          default: {
            commit(logTool(current, name, true))
            return { ok: true, result: { ok: true, note: "Acknowledged." } }
          }
        }
      } catch (error) {
        return {
          ok: false,
          result: { error: error instanceof Error ? error.message : "Tool failed." },
        }
      }
    },
    [commit, logTool]
  )

  return {
    state,
    executeTool,
    setChaos,
    setSeverity,
    addManualActionItem,
    hydrate,
    seedDemoScenario,
    serviceNames: Object.keys(state.services) as ServiceName[],
  }
}
