"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { TimelineMessage } from "@/lib/timeline"

function formatOffset(at: number | null, start: number | null): string {
  if (at === null || start === null) return ""
  const seconds = Math.max(0, Math.round((at - start) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `+${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

function clip(text: string, limit = 600): string {
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text
}

/** Sparse timestamps: carry the last known one forward so gaps stay honest. */
function withTimestamps(
  messages: TimelineMessage[]
): { message: TimelineMessage; when: string }[] {
  const start = messages.find((message) => typeof message.at === "number")?.at ?? null
  let carried = start

  return messages.map((message) => {
    if (typeof message.at === "number") carried = message.at
    return { message, when: formatOffset(carried, start) }
  })
}

/** Full user / agent / tool transcript straight from the session timeline artifact. */
export function SessionTranscript({
  messages,
  loading,
  error,
}: {
  messages: TimelineMessage[]
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
        {error}
      </p>
    )
  }

  if (!messages.length) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
        No transcript artifact for this session yet. Artifacts land a moment after the call ends —
        hit Regenerate to re-fetch.
      </p>
    )
  }

  const rows = withTimestamps(messages)

  return (
    <ol className="flex flex-col gap-2.5">
      {rows.map(({ message, when }, index) => {
        if (message.role === "tool") {
          const args = message.arguments ? JSON.stringify(message.arguments) : "{}"
          return (
            <li
              key={index}
              className="flex gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
            >
              <span className="w-11 shrink-0 pt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                {when}
              </span>
              <span className="w-9 shrink-0 pt-0.5 font-mono text-[10px] tracking-widest text-primary uppercase">
                tool
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px] break-all">
                  {message.name}({args})
                </div>
                <div
                  className={cn(
                    "font-mono text-[11px] break-words",
                    message.error ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {message.error ? "error: " : "→ "}
                  {clip(message.result ?? "(no result)")}
                </div>
              </div>
            </li>
          )
        }

        return (
          <li key={index} className="flex gap-3 px-1">
            <span className="w-11 shrink-0 pt-1 font-mono text-[10px] text-muted-foreground tabular-nums">
              {when}
            </span>
            <span
              className={cn(
                "w-11 shrink-0 pt-1 font-mono text-[10px] tracking-widest uppercase",
                message.role === "user" ? "text-muted-foreground" : "text-primary/80"
              )}
            >
              {message.role === "user" ? "you" : "agent"}
            </span>
            <p
              className={cn(
                "min-w-0 flex-1 text-sm leading-relaxed break-words",
                message.role === "user" ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {message.text}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
