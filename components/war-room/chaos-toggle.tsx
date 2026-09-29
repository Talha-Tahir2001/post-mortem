"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { IconBolt } from "@tabler/icons-react"

/**
 * The demo hook: flip this mid-call and the checkout service starts failing,
 * so the agent discovers live bad metrics on the next tool call.
 */
export function ChaosToggle({
  active,
  onToggle,
  disabled,
}: {
  active: boolean
  onToggle: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <Card
      size="sm"
      className={cn(
        "transition-colors",
        active && "border-destructive/60 bg-destructive/5 ring-destructive/20"
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconBolt
            className={cn("size-4", active ? "text-destructive" : "text-muted-foreground")}
          />
          Chaos simulation
        </CardTitle>
        <CardDescription>
          {active
            ? "checkout is now returning 502s — ask the agent to check it."
            : "Flip to fail checkout mid-call and watch the agent react."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="chaos-switch" className="text-sm text-muted-foreground">
            Simulate bad build
          </Label>
          <Switch
            id="chaos-switch"
            checked={active}
            onCheckedChange={onToggle}
            disabled={disabled}
            aria-label="Simulate bad build"
          />
        </div>
      </CardContent>
    </Card>
  )
}
