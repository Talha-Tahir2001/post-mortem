import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { SEVERITY_META, type Severity } from "@/lib/types"

export function SeverityBadge({
  level,
  className,
}: {
  level: Severity | null
  className?: string
}) {
  if (!level) {
    return (
      <Badge
        variant="outline"
        className={cn("font-mono text-muted-foreground", className)}
      >
        SEV?
      </Badge>
    )
  }

  const meta = SEVERITY_META[level]
  return (
    <Badge className={cn("gap-1.5 font-mono ring-1 ring-inset", meta.className, className)}>
      <span className={cn("size-1.5 rounded-full", meta.dotClassName)} />
      {meta.label}
    </Badge>
  )
}
