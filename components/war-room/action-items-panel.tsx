"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { IconPlus, IconUser } from "@tabler/icons-react"
import type { ActionItem } from "@/lib/types"

export function ActionItemsPanel({
  items,
  onAdd,
}: {
  items: ActionItem[]
  onAdd: (task: string, owner?: string) => void
}) {
  const [task, setTask] = useState("")
  const [owner, setOwner] = useState("")

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = task.trim()
    if (!trimmed) return
    onAdd(trimmed, owner.trim() || undefined)
    setTask("")
    setOwner("")
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Action items</CardTitle>
        <CardDescription>{items.length} captured this call</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
            Nothing yet. Say &ldquo;add action item: …&rdquo; and it lands here mid-call.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-lg border border-border bg-background/40 px-3 py-2"
              >
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 flex-1 text-sm leading-snug">{item.task}</span>
                <Badge variant="secondary" className="shrink-0 gap-1 font-mono text-[10px]">
                  <IconUser className="size-3" />
                  {item.owner}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit} className="flex flex-col gap-2">
          <Input
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Add an action item…"
            aria-label="Action item"
          />
          <div className="flex gap-2">
            <Input
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              placeholder="Owner (optional)"
              aria-label="Owner"
            />
            <Button type="submit" variant="secondary" size="icon" aria-label="Add action item">
              <IconPlus />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
