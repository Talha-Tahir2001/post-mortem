import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { IncidentFacts, PostmortemTimelineEntry } from "@/lib/postmortem-schema"

const ACTOR_STYLE: Record<string, string> = {
  user: "border-sky-500/40 text-sky-500",
  agent: "border-primary/40 text-primary",
  tool: "border-emerald-500/40 text-emerald-500",
}

export function Timeline({
  entries,
  facts,
}: {
  entries: PostmortemTimelineEntry[]
  facts: IncidentFacts | null
}) {
  return (
    <div className="flex flex-col gap-6">
      {facts && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label="duration" value={facts.duration_seconds != null ? `${facts.duration_seconds}s` : "—"} />
          <Fact label="turns" value={`${facts.turn_count}`} />
          <Fact
            label="first audio"
            value={facts.time_to_first_audio_ms != null ? `${facts.time_to_first_audio_ms}ms` : "—"}
          />
          <Fact label="tool calls" value={`${facts.tool_calls.length}`} />
        </dl>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No timeline entries were recorded.</p>
      ) : (
        <ol className="relative flex flex-col gap-4 pl-4 before:absolute before:top-1 before:bottom-1 before:left-0 before:w-px before:bg-border">
          {entries.map((entry, index) => (
            <li key={`${entry.when}-${index}`} className="relative">
              <span
                className={cn(
                  "absolute top-1.5 -left-[calc(var(--spacing)_*_4_+_2.5px)] size-1.5 rounded-full ring-2 ring-background",
                  entry.actor === "user"
                    ? "bg-sky-500"
                    : entry.actor === "tool"
                      ? "bg-emerald-500"
                      : "bg-primary"
                )}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {entry.when}
                </span>
                <Badge
                  variant="outline"
                  className={cn("font-mono text-[10px] uppercase", ACTOR_STYLE[entry.actor])}
                >
                  {entry.actor}
                </Badge>
              </div>
              <p className="mt-1 text-sm leading-relaxed">{entry.event}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <dt className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">{value}</dd>
    </div>
  )
}
