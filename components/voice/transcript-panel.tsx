"use client"

import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { TranscriptEntry } from "@/hooks/use-voice-session"
import type { ToolLogEntry } from "@/lib/types"
import { TOOL_LABELS } from "@/lib/tools"
import { IconTerminal2 } from "@tabler/icons-react"

function Entry({ entry }: { entry: TranscriptEntry }) {
  const isUser = entry.role === "user"
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "font-mono text-[10px] tracking-widest uppercase",
            isUser ? "text-sky-500" : "text-primary"
          )}
        >
          {isUser ? "responder" : "agent"}
        </span>
        {!entry.final && <span className="size-1 animate-pulse rounded-full bg-muted-foreground" />}
      </div>
      <p className={cn("text-sm leading-relaxed", isUser ? "text-foreground" : "text-foreground/85")}>
        {entry.text}
        {!entry.final && entry.text && (
          <span className="ml-0.5 inline-block size-2 animate-pulse rounded-full bg-primary/70 align-middle" />
        )}
      </p>
    </div>
  )
}

export function TranscriptPanel({
  entries,
  toolLog,
  status,
}: {
  entries: TranscriptEntry[]
  toolLog: ToolLogEntry[]
  status: string
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const [pinned, setPinned] = useState(true)

  useEffect(() => {
    if (!pinnedRef.current) return
    const node = viewportRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [entries])

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const node = event.currentTarget
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight
    const next = distance < 48
    pinnedRef.current = next
    if (next !== pinned) setPinned(next)
  }

  const latestTools = toolLog.slice(0, 3)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          live transcript
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{entries.length} turns</span>
      </div>

      {latestTools.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {latestTools.map((tool) => (
            <Badge
              key={tool.id}
              variant="outline"
              className={cn(
                "gap-1 font-mono text-[10px]",
                tool.ok
                  ? "border-emerald-500/40 text-emerald-500"
                  : "border-destructive/50 text-destructive"
              )}
            >
              <IconTerminal2 className="size-3" />
              {tool.detail ?? TOOL_LABELS[tool.name] ?? tool.name}
            </Badge>
          ))}
        </div>
      )}

      <div
        ref={viewportRef}
        onScroll={handleScroll}
        className="min-h-64 flex-1 overflow-y-auto rounded-xl border border-border bg-background/40"
      >
        {entries.length === 0 ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              {status === "connecting" ? "opening the line…" : "waiting for the call"}
            </span>
            <p className="max-w-xs text-sm text-muted-foreground">
              Start the call and the agent greets you. Everything it hears and says streams here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5 p-4">
            {entries.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
      {!pinned && (
        <span className="text-center font-mono text-[10px] text-muted-foreground">
          scroll to follow the live turn
        </span>
      )}
    </div>
  )
}
