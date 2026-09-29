"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  ChecklistStatus,
  ServiceName,
  ServiceState,
  Severity,
} from "@/lib/types"
import { IconWorldWww } from "@tabler/icons-react"

function worstService(services: Record<ServiceName, ServiceState>): ServiceName {
  const failing = Object.entries(services).find(([, s]) => s.status === "failing")
  if (failing) return failing[0] as ServiceName
  const degraded = Object.entries(services).find(([, s]) => s.status === "degraded")
  if (degraded) return degraded[0] as ServiceName
  return "checkout"
}

function draftMessage(
  services: Record<ServiceName, ServiceState>,
  severity: Severity | null
): string {
  const service = worstService(services)
  const status = services[service].status
  const sev = severity ? ` (${severity})` : ""

  if (status === "failing") {
    return `We are investigating elevated errors on ${service}${sev}. Some requests are failing. Next update within 30 minutes.`
  }
  if (status === "degraded") {
    return `We are seeing degraded performance on ${service}${sev}. Some requests are slower than usual. Next update within 30 minutes.`
  }
  return `Some customers may have seen errors on ${service}${sev}. The issue is resolved and we are monitoring.`
}

const STATE_META: Record<
  ChecklistStatus,
  { label: string; badgeClassName: string }
> = {
  pending: { label: "draft", badgeClassName: "text-muted-foreground" },
  in_progress: { label: "posting", badgeClassName: "text-amber-500" },
  done: { label: "posted", badgeClassName: "text-emerald-500" },
  skipped: { label: "skipped", badgeClassName: "text-muted-foreground" },
}

/**
 * Customer-facing mirror of the `status_page` checklist step: the agent posts
 * the update through its tool, and this card shows what customers would see.
 */
export function StatusPagePanel({
  status,
  services,
  severity,
}: {
  status: ChecklistStatus
  services: Record<ServiceName, ServiceState>
  severity: Severity | null
}) {
  const message = draftMessage(services, severity)
  const meta = STATE_META[status]

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconWorldWww className="size-4 text-primary" />
          Status page
          <Badge
            variant="outline"
            className={cn("ml-auto font-mono text-[10px] uppercase", meta.badgeClassName)}
          >
            {status === "in_progress" && (
              <span className="mr-1 size-1.5 animate-pulse rounded-full bg-amber-500" />
            )}
            {meta.label}
          </Badge>
        </CardTitle>
        <CardDescription>
          {status === "done"
            ? "Published to customers during this call"
            : status === "skipped"
              ? "Customers were not notified"
              : status === "in_progress"
                ? "Publishing the update now…"
                : "Say “update the status page” and the agent posts it"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "rounded-md border px-3 py-2.5 text-xs leading-relaxed",
            status === "done" && "border-emerald-500/40 bg-emerald-500/5 text-foreground",
            status === "in_progress" && "border-amber-500/40 bg-amber-500/5 text-foreground",
            status === "pending" && "border-dashed border-border bg-background/40 text-muted-foreground",
            status === "skipped" && "border-border bg-muted/40 text-muted-foreground line-through"
          )}
        >
          {message}
        </div>
        {status === "pending" && (
          <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            preview · not yet posted
          </p>
        )}
      </CardContent>
    </Card>
  )
}
