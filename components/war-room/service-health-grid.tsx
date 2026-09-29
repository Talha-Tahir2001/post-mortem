"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { HEALTH_META, SERVICES, type ServiceState } from "@/lib/types"

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
      <span className={cn("font-mono text-sm tabular-nums", tone ?? "text-foreground")}>
        {value}
      </span>
    </div>
  )
}

export function ServiceHealthGrid({
  services,
}: {
  services: Record<string, ServiceState>
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Service health</CardTitle>
        <CardDescription>Live from the responder&apos;s dashboard</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
        {SERVICES.map((service) => {
          const state = services[service]
          const meta = HEALTH_META[state.status]
          return (
            <div
              key={service}
              className={cn(
                "rounded-lg border border-border bg-background/40 px-3 py-2.5",
                state.status === "failing" && "border-destructive/50 bg-destructive/5",
                state.status === "degraded" && "border-amber-500/50 bg-amber-500/5"
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium">{service}</span>
                <span className={cn("flex items-center gap-1.5 text-xs", meta.textClassName)}>
                  <span className={cn("size-1.5 rounded-full", meta.dotClassName)} />
                  {meta.label}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="http" value={String(state.http_code)} tone={state.http_code >= 500 ? "text-destructive" : undefined} />
                <Metric label="p95" value={`${state.p95_ms}ms`} />
                <Metric
                  label="err"
                  value={`${state.error_pct}%`}
                  tone={state.error_pct > 5 ? "text-destructive" : undefined}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
