import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { IconUser } from "@tabler/icons-react"
import type { Postmortem } from "@/lib/postmortem-schema"

export function FindingsCards({ postmortem }: { postmortem: Postmortem }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card size="sm" className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Root cause hypotheses</CardTitle>
          <CardDescription>Unconfirmed unless a tool result proved it on the call</CardDescription>
        </CardHeader>
        <CardContent>
          {postmortem.root_cause_hypotheses.length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <Accordion>
              {postmortem.root_cause_hypotheses.map((hypothesis, index) => (
                <AccordionItem key={index}>
                  <AccordionTrigger>
                    <span className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        H{index + 1}
                      </Badge>
                      {hypothesis}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Confirm with logs, the deploy diff and a replay before writing this into the
                    final document.
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Action items</CardTitle>
          <CardDescription>Client-captured items first, then anything the model added</CardDescription>
        </CardHeader>
        <CardContent>
          {postmortem.action_items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No action items were captured.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {postmortem.action_items.map((item, index) => (
                <li
                  key={`${item.task}-${index}`}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2"
                >
                  <span className="text-sm leading-snug">{item.task}</span>
                  <Badge variant="secondary" className="shrink-0 gap-1 font-mono text-[10px]">
                    <IconUser className="size-3" />
                    {item.owner ?? "Unassigned"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <ListCard title="What went well" items={postmortem.went_well} tone="good" />
        <ListCard title="What went poorly" items={postmortem.went_poorly} tone="bad" />
      </div>
    </div>
  )
}

function ListCard({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: "good" | "bad"
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className={tone === "good" ? "text-emerald-500" : "text-amber-500"}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing noted.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <span
                  className={
                    tone === "good"
                      ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500"
                      : "mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500"
                  }
                />
                <span className="leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
