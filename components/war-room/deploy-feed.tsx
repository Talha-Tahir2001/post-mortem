"use client"

import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatAgo } from "@/lib/sim"
import type { Deploy } from "@/lib/types"

export function DeployFeed({ chaos }: { chaos: boolean }) {
  const [deploys, setDeploys] = useState<Deploy[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/sim/deploys")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("bad status"))))
      .then((payload: { deploys?: Deploy[] }) => {
        if (!cancelled) setDeploys(payload.deploys ?? [])
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Deploy feed</CardTitle>
        <CardDescription>Source of the get_recent_deploys HTTP tool</CardDescription>
      </CardHeader>
      <CardContent className="gap-0">
        {failed ? (
          <p className="text-xs text-muted-foreground">Deploy feed unavailable.</p>
        ) : deploys === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : (
          <ul className="flex flex-col">
            {deploys.slice(0, 8).map((deploy) => {
              const suspect = chaos && deploy.hash === "a1b9f3e"
              return (
                <li
                  key={`${deploy.service}-${deploy.hash}`}
                  className={cn(
                    "flex items-center gap-3 border-b border-border/60 py-2 last:border-0",
                    suspect && "text-destructive"
                  )}
                >
                  <span className="w-16 shrink-0 font-mono text-xs">{deploy.hash}</span>
                  <span
                    className="min-w-0 flex-1 truncate text-xs"
                    title={`${deploy.message} — ${deploy.author}`}
                  >
                    {deploy.message}
                  </span>
                  <Badge
                    variant={deploy.service === "checkout" ? "default" : "secondary"}
                    className="shrink-0 font-mono text-[10px]"
                  >
                    {deploy.service}
                  </Badge>
                  <span className="w-20 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                    {formatAgo(deploy.minutesAgo)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
