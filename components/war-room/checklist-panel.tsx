"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { CHECKLIST, type ChecklistStatus } from "@/lib/types"
import { IconCheck, IconMinus, IconCircleDashed } from "@tabler/icons-react"

const STATUS_STYLE: Record<ChecklistStatus, string> = {
  pending: "border-border text-muted-foreground",
  in_progress: "border-amber-500/60 bg-amber-500/10 text-amber-500",
  done: "border-emerald-500/60 bg-emerald-500/10 text-emerald-500",
  skipped: "border-border bg-muted text-muted-foreground line-through",
}

export function ChecklistPanel({
  checklist,
}: {
  checklist: Record<string, ChecklistStatus>
}) {
  const resolved = CHECKLIST.filter(
    (step) => checklist[step.id] === "done" || checklist[step.id] === "skipped"
  ).length
  const inProgress = CHECKLIST.filter((step) => checklist[step.id] === "in_progress").length
  const percent = Math.round((resolved / CHECKLIST.length) * 100)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Triage checklist</CardTitle>
        <CardDescription>
          {resolved}/{CHECKLIST.length} closed
          {inProgress > 0 ? ` · ${inProgress} in progress` : ""}
        </CardDescription>
        <div className="pt-2">
          <Progress value={percent} aria-label="Checklist progress" />
        </div>
      </CardHeader>
      <CardContent className="gap-0">
        <ol className="flex flex-col">
          {CHECKLIST.map((step, index) => {
            const status = checklist[step.id] ?? "pending"
            return (
              <li
                key={step.id}
                className="flex items-start gap-3 border-b border-border/60 py-2.5 last:border-0"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                    STATUS_STYLE[status]
                  )}
                >
                  {status === "done" ? (
                    <IconCheck className="size-3" strokeWidth={3} />
                  ) : status === "skipped" ? (
                    <IconMinus className="size-3" strokeWidth={3} />
                  ) : status === "in_progress" ? (
                    <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                  ) : (
                    <IconCircleDashed className="size-3" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      status === "pending" && "text-foreground/80",
                      status === "skipped" && "text-muted-foreground"
                    )}
                  >
                    <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {step.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{step.hint}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
