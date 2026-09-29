import Link from "next/link"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { StartIncidentButton } from "@/components/start-incident-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { getApiKey, listSessions } from "@/lib/assemblyai"
import type { SessionSummary } from "@/lib/assemblyai"
import {
  IconAlertTriangle,
  IconArrowRight,
  IconChartLine,
  IconChecklist,
  IconCheckbox,
  IconClock,
  IconFileText,
  IconHeartbeat,
  IconMicrophone,
  IconMessageCircle,
  IconRocket,
  IconServer,
  IconTool,
} from "@tabler/icons-react"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Post Mortem — talk through the incident, we'll write the postmortem",
  description:
    "A voice-first incident war room built on the AssemblyAI Voice Agent API: the agent runs your verbal triage checklist, pulls live deploy and health data through tools, then turns the call into a complete postmortem.",
}

const STEPS = [
  {
    icon: IconMicrophone,
    title: "Talk, don't type",
    body: "Open the call and say what's broken. The agent runs the triage checklist out loud — severity first, then health, then what changed.",
  },
  {
    icon: IconTool,
    title: "Live tools, live panels",
    body: "Deploy history comes from an HTTP tool; health, error rate, severity, checklist and action items run as client-side tools that update the dashboard mid-sentence.",
  },
  {
    icon: IconFileText,
    title: "The report writes itself",
    body: "End the call. The session timeline plus structured output become a shareable postmortem with timeline, root causes and owners.",
  },
]

const TOOLS = [
  {
    icon: IconHeartbeat,
    name: "check_service_health(service)",
    body: "Status, HTTP code and p95 latency for checkout, api or web.",
    drives: "Service health grid",
  },
  {
    icon: IconChartLine,
    name: "get_error_rate(service, window)",
    body: "Error percentage over the last 5 minutes or the last hour.",
    drives: "Health readout",
  },
  {
    icon: IconRocket,
    name: "get_recent_deploys(service)",
    body: "Last five deploys, newest first: hash, author, message, when it shipped.",
    drives: "Deploy feed · HTTP tool",
  },
  {
    icon: IconAlertTriangle,
    name: "set_severity(level)",
    body: "Records SEV1, SEV2 or SEV3 the second you say it out loud.",
    drives: "Severity badge",
  },
  {
    icon: IconChecklist,
    name: "update_checklist(step, status)",
    body: "Ticks, starts or skips one of the seven triage steps — only once you confirm it.",
    drives: "Checklist panel",
  },
  {
    icon: IconCheckbox,
    name: "add_action_item(task, owner)",
    body: "Captures a follow-up the moment you mention one, even without saying 'action item'.",
    drives: "Action items panel",
  },
  {
    icon: IconMessageCircle,
    name: "respond_freely()",
    body: "Escape hatch for small talk, jokes and meta questions. No dashboard writes.",
    drives: "Transcript only",
  },
]

const FLOW = [
  {
    icon: IconMicrophone,
    title: "Mic to 24 kHz PCM",
    body: "An AudioWorklet resamples the mic to 24 kHz PCM16 and streams base64 chunks over a WebSocket.",
  },
  {
    icon: IconServer,
    title: "AssemblyAI runs the agent",
    body: "Your stored agent (voice 'charles', barge-in on) transcribes, reasons and speaks back with streaming deltas.",
  },
  {
    icon: IconTool,
    title: "Tools answer back",
    body: "Six tools run in the browser, one hits your API. Results are queued and flushed on reply.done.",
  },
  {
    icon: IconChecklist,
    title: "Panels move live",
    body: "Severity, checklist, health, deploys and action items update mid-sentence — no refresh, no typing.",
  },
  {
    icon: IconFileText,
    title: "Call becomes document",
    body: "session.end closes the window, the timeline artifact is flattened, and structured output becomes the postmortem.",
  },
]

const FAQ = [
  {
    q: "Do I need to pay for the LLM Gateway?",
    a: "No. If your AssemblyAI account has no Gateway access, the report is built by a deterministic offline pass over the same transcript: real timestamps from the timeline, hypotheses pulled from deploy and health tool results, and the checklist and action items you captured. You can also point LLM_BASE_URL and LLM_API_KEY at any OpenAI-compatible provider.",
  },
  {
    q: "What runs where?",
    a: "The browser holds the microphone, the WebSocket, and answers six function tools directly so panels update instantly. get_recent_deploys is an HTTP tool served by /api/sim/deploys — publishing it as a real webhook as soon as APP_URL is a public https URL. The server only mints tokens and flattens the session timeline.",
  },
  {
    q: "Where does the audio go?",
    a: "Straight to AssemblyAI over WSS for the duration of the session. This app stores nothing but your incident draft and the generated report in localStorage, and it sends session.end on teardown so the billable resume window closes.",
  },
  {
    q: "Is the agent allowed to guess numbers?",
    a: "No. The system prompt has an anti-fabrication clause: error rates, deploy hashes, status codes and latencies may only be repeated from a tool result in that conversation. If a tool returns nothing, the agent says so instead of estimating.",
  },
  {
    q: "What happens if I close the tab mid-call?",
    a: "A synchronous session.end is sent on pagehide, so the session is recorded as completed and the postmortem is still generateable from the history page.",
  },
]

/** Verbatim excerpt from a real session on this account. */
const TRANSCRIPT_PREVIEW = [
  { role: "agent", text: "Post Mortem online. What are we looking at — what's broken and since when?" },
  { role: "user", text: "The auth is not working." },
  { role: "agent", text: "Which service is the auth part of — api, web, or checkout?" },
  { role: "user", text: "API." },
  {
    role: "tool",
    text: "check_service_health(service=api) → healthy, HTTP 200, p95 120ms",
  },
  {
    role: "agent",
    text: "API is reporting as healthy with two hundred millisecond latency. How bad is this — SEV1, SEV2 or SEV3?",
  },
  { role: "user", text: "SEV1." },
  { role: "tool", text: "set_severity(level=SEV1) → SEV1" },
  { role: "tool", text: "get_recent_deploys(service=api) → 5 deploys, latest 4f1c9de" },
  {
    role: "agent",
    text: "The latest API deploy is 4f1c9de, twenty four minutes ago, with the message cache tenant feature flags. Do you want to roll that back?",
  },
]

async function loadSessions() {
  if (!getApiKey()) return { sessions: [], configured: false }
  try {
    return { sessions: await listSessions(8), configured: true }
  } catch {
    return { sessions: [], configured: true }
  }
}

function latestSession(sessions: SessionSummary[]): SessionSummary | null {
  return sessions.find((session) => session.status === "completed") ?? sessions[0] ?? null
}

export default async function LandingPage() {
  const { sessions, configured } = await loadSessions()
  const latest = latestSession(sessions)

  return (
    <div className="relative min-h-svh overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,theme(border.DEFAULT)_1px,transparent_1px),linear-gradient(to_bottom,theme(border.DEFAULT)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-40"
      />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-16 px-6 py-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <IconMicrophone className="size-4" />
            </span>
            <span className="font-mono text-sm font-medium tracking-tight">post_mortem</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 font-mono text-[10px]">
              <span className="size-1.5 rounded-full bg-primary" />
              AssemblyAI Voice Agent API
            </Badge>
            <ThemeToggle />
          </div>
        </header>

        <section className="flex flex-col gap-6">
          <Badge variant="secondary" className="w-fit font-mono text-[10px] tracking-widest uppercase">
            incident response, out loud
          </Badge>
          <h1 className="font-heading max-w-3xl text-4xl leading-[1.05] font-medium tracking-tight text-balance sm:text-6xl">
            Talk through the incident.
            <span className="block text-muted-foreground">We&apos;ll write the postmortem.</span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Post Mortem is a war room for on-call engineers. Instead of typing into checklists and
            blank docs at 2 AM, you <em>talk</em>: the agent triages with you, pulls live deploy and
            health data through tools, and turns the call into the document you hate writing.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <StartIncidentButton />
            <a href="#how" className={buttonVariants({ variant: "outline", size: "lg" })}>
              How it works
              <IconArrowRight />
            </a>
            {latest && (
              <Link
                href={`/postmortem/${latest.id}`}
                className={buttonVariants({ variant: "ghost", size: "lg" })}
              >
                Read a real report
                <IconArrowRight />
              </Link>
            )}
          </div>

          <dl className="grid max-w-2xl grid-cols-3 gap-4 pt-4">
            <Stat value="0" label="keystrokes during triage" />
            <Stat value="7" label="tools on the agent" />
            <Stat value="1" label="call → shareable report" />
          </dl>
        </section>

        <Separator />

        <section className="flex flex-col gap-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-heading text-xl font-medium">Recent incidents</h2>
              <p className="text-sm text-muted-foreground">
                Every call is one AssemblyAI session — this is the whole incident history.
              </p>
            </div>
          </div>

          {!configured ? (
            <Card size="sm" className="border-amber-500/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-500">
                  <IconAlertTriangle className="size-4" />
                  Not configured yet
                </CardTitle>
                <CardDescription>
                  Add ASSEMBLYAI_API_KEY to .env.local, then run{" "}
                  <code className="font-mono text-foreground">npm run publish:agent</code> to create
                  the incident commander agent.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : sessions.length === 0 ? (
            <Card size="sm">
              <CardContent className="text-sm text-muted-foreground">
                No sessions yet — start the first incident and it will show up here.
              </CardContent>
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {sessions.map((session) => (
                <li key={session.id}>
                  <Link href={`/postmortem/${session.id}`} className="group block">
                    <Card size="sm" className="transition-colors group-hover:border-primary/50">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between gap-3 font-mono text-sm">
                          <span className="truncate">{session.id}</span>
                          <Badge
                            variant={session.status === "completed" ? "secondary" : "outline"}
                            className="shrink-0 text-[10px]"
                          >
                            {session.status ?? "unknown"}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1">
                            <IconClock className="size-3" />
                            {typeof session.duration_seconds === "number"
                              ? `${Math.round(session.duration_seconds)}s`
                              : "—"}
                          </span>
                          <span>{session.created_at ? formatStamp(session.created_at) : ""}</span>
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {latest && (
          <section className="flex flex-col gap-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-heading text-xl font-medium">A real call, verbatim</h2>
                <p className="text-sm text-muted-foreground">
                  Not a mock-up — these lines came out of a session on this account, tools included.
                </p>
              </div>
              <Link
                href={`/postmortem/${latest.id}`}
                className="hidden shrink-0 font-mono text-xs text-primary underline underline-offset-4 sm:block"
              >
                full report →
              </Link>
            </div>

            <Card size="sm">
              <CardContent className="flex flex-col gap-2.5 pt-4 font-mono text-xs leading-relaxed">
                {TRANSCRIPT_PREVIEW.map((line, index) => (
                  <div
                    key={index}
                    className={
                      line.role === "tool"
                        ? "flex gap-2 text-muted-foreground"
                        : line.role === "agent"
                          ? "flex gap-2 text-foreground"
                          : "flex gap-2 text-foreground/70"
                    }
                  >
                    <span className="w-12 shrink-0 text-[10px] tracking-widest text-muted-foreground uppercase">
                      {line.role === "tool" ? "tool" : line.role === "agent" ? "agent" : "you"}
                    </span>
                    <span className={line.role === "tool" ? "text-primary/80" : ""}>
                      {line.role === "tool" ? "→ " : ""}
                      {line.text}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        <section id="how" className="flex flex-col gap-5 scroll-mt-10">
          <h2 className="font-heading text-xl font-medium">How it works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <Card key={step.title} size="sm" className="relative">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <step.icon className="size-4 text-primary" />
                    {step.title}
                  </CardTitle>
                  <CardDescription>
                    <span className="mr-1 font-mono text-[10px]">0{index + 1}</span>
                    {step.body}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-heading text-xl font-medium">Seven tools, mid-sentence</h2>
              <p className="text-sm text-muted-foreground">
                Each call the agent makes lands on a live panel while you are still talking.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((tool) => (
              <Card key={tool.name} size="sm" className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <tool.icon className="size-4 shrink-0 text-primary" />
                    <span className="truncate font-mono text-xs">{tool.name}</span>
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    {tool.body}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                    → {tool.drives}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="font-heading text-xl font-medium">From mic to document</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FLOW.map((step, index) => (
              <Card key={step.title} size="sm" className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      0{index + 1}
                    </span>
                    <step.icon className="size-4 text-primary" />
                    {step.title}
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{step.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="font-heading text-xl font-medium">Questions you will have</h2>
          <Accordion>
            {FAQ.map((item) => (
              <AccordionItem key={item.q}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <footer className="flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <IconServer className="size-4" />
            Built with AssemblyAI Voice Agent API + LLM Gateway
          </p>
          <p className="font-mono text-[10px] tracking-widest uppercase">
            AssemblyAI Voice Hackathon · lablab.ai
          </p>
        </footer>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="font-mono text-3xl font-medium tabular-nums">{value}</dt>
      <dd className="text-xs text-muted-foreground">{label}</dd>
    </div>
  )
}

function formatStamp(iso: string) {
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return ""
  return new Date(parsed).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
