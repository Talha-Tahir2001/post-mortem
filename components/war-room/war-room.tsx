"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { VoiceCall } from "@/components/voice/voice-call"
import { ActionItemsPanel } from "@/components/war-room/action-items-panel"
import { ChaosToggle } from "@/components/war-room/chaos-toggle"
import { ChecklistPanel } from "@/components/war-room/checklist-panel"
import { DeployFeed } from "@/components/war-room/deploy-feed"
import { ServiceHealthGrid } from "@/components/war-room/service-health-grid"
import { StatusPagePanel } from "@/components/war-room/status-page-panel"
import { SeverityBadge } from "@/components/war-room/severity-badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { useIncidentState } from "@/hooks/use-incident-state"
import { useVoiceSession } from "@/hooks/use-voice-session"
import { requestPostmortem } from "@/lib/report-client"
import {
  loadIncident,
  saveIncident,
  saveReport,
  saveReportContext,
} from "@/lib/storage"
import { cn } from "@/lib/utils"
import type { Severity } from "@/lib/types"
import { IconArrowLeft, IconLoader2, IconSparkles, IconWand } from "@tabler/icons-react"

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function WarRoom({ incidentId }: { incidentId: string }) {
  const router = useRouter()
  const incident = useIncidentState()

  const [title, setTitle] = useState("Untitled incident")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number>(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [writing, setWriting] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)
  const restoredRef = useRef(false)

  const voice = useVoiceSession({
    executeTool: incident.executeTool,
    onSessionReady: (id) => {
      if (id) setSessionId(id)
      setStartedAt(Date.now())
    },
    onSessionEnded: (id) => {
      void generateReport(id)
    },
  })

  // Restore the incident from localStorage (refresh / back-nav).
  // This runs once, synchronously, before the persist effect below can
  // overwrite the snapshot with the initial state — hence the inline setState.
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const saved = loadIncident(incidentId)
    if (!saved) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(saved.title || "Untitled incident")
    if (saved.startedAt) setStartedAt(saved.startedAt)
    if (saved.sessionId) setSessionId(saved.sessionId)
    incident.hydrate({
      severity: saved.severity ?? null,
      actionItems: saved.actionItems ?? [],
      ...(saved.checklist ? { checklist: saved.checklist } : {}),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId])

  // Persist on every meaningful change so a refresh never loses the incident.
  useEffect(() => {
    if (!restoredRef.current) return
    saveIncident({
      incidentId,
      title,
      startedAt,
      sessionId,
      severity: incident.state.severity,
      actionItems: incident.state.actionItems,
      checklist: incident.state.checklist,
    })
  }, [incidentId, title, startedAt, sessionId, incident.state])

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [startedAt])

  const generateReport = useCallback(
    async (id: string | null) => {
      if (!id) {
        setWriteError("The call ended before a session was opened — nothing to report.")
        return
      }

      setWriting(true)
      setWriteError(null)

      const context = {
        title,
        severity: incident.state.severity,
        actionItems: incident.state.actionItems,
      }
      saveReportContext(id, context)

      try {
        // Give AssemblyAI a moment to finish the session before we read artifacts.
        await new Promise((resolve) => setTimeout(resolve, 2500))

        const result = await requestPostmortem({
          sessionId: id,
          title: context.title,
          severity: context.severity,
          actionItems: context.actionItems,
        })

        saveReport(id, {
          facts: result.facts,
          postmortem: result.postmortem,
          cachedAt: Date.now(),
          source: result.source,
          source_detail: result.source_detail,
        })
        router.push(`/postmortem/${id}`)
      } catch (error) {
        setWriteError(
          error instanceof Error ? error.message : "Could not generate the postmortem."
        )
        setWriting(false)
      }
    },
    [incident.state.actionItems, incident.state.severity, router, title]
  )

  const setSeverity = (level: Severity) => incident.setSeverity(level)

  return (
    <div className="mx-auto flex min-h-svh max-w-[1440px] flex-col gap-4 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back to incidents"
          onClick={() => router.push("/")}
        >
          <IconArrowLeft />
        </Button>

        <SeverityBadge level={incident.state.severity} />

        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Name this incident"
          aria-label="Incident title"
          className="h-9 max-w-md flex-1 border-transparent bg-transparent px-2 font-heading text-base font-medium shadow-none hover:border-input focus-visible:border-ring md:text-base"
        />

        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-sm text-muted-foreground tabular-nums">
            {formatElapsed(elapsed)}
          </span>
          {sessionId && (
            <span className="hidden max-w-48 truncate font-mono text-[10px] text-muted-foreground sm:block">
              {sessionId}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTitle("Checkout returning 502s")
              incident.seedDemoScenario()
            }}
            className="hidden md:inline-flex"
          >
            <IconWand />
            Load demo
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => incident.addManualActionItem("Write the postmortem", "Unassigned")}
            className="hidden md:inline-flex"
          >
            <IconSparkles />
            Seed action item
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <Separator />

      <main className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_480px] 2xl:grid-cols-[minmax(0,1fr)_540px]">
        <div className="flex min-h-0 flex-col">
          <VoiceCall
            status={voice.status}
            error={voice.error}
            muted={voice.muted}
            analyser={voice.analyser}
            soundOn={voice.soundOn}
            entries={voice.entries}
            toolLog={incident.state.toolLog}
            onStart={() => void voice.connect()}
            onEnd={() => voice.end()}
            onToggleMute={() => voice.setMuted(!voice.muted)}
            onToggleSound={() => voice.setSoundOn(!voice.soundOn)}
          />
        </div>

        <aside className="flex flex-col gap-4 [&>*]:shrink-0 lg:max-h-[calc(100svh-8rem)] lg:overflow-y-auto lg:pr-1">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              set severity
            </span>
            <div className="ml-auto flex gap-1">
              {(["SEV1", "SEV2", "SEV3"] as Severity[]).map((level) => (
                <Button
                  key={level}
                  size="xs"
                  variant={incident.state.severity === level ? "default" : "ghost"}
                  onClick={() => setSeverity(level)}
                  className="font-mono"
                >
                  {level}
                </Button>
              ))}
            </div>
          </div>

          <ChecklistPanel checklist={incident.state.checklist} />
          <StatusPagePanel
            status={incident.state.checklist.status_page ?? "pending"}
            services={incident.state.services}
            severity={incident.state.severity}
          />
          <ServiceHealthGrid services={incident.state.services} />
          <ChaosToggle active={incident.state.chaos} onToggle={incident.setChaos} />
          <ActionItemsPanel
            items={incident.state.actionItems}
            onAdd={incident.addManualActionItem}
          />
          <DeployFeed chaos={incident.state.chaos} />
        </aside>
      </main>

      {(writing || writeError) && (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 border-t px-6 py-4",
            writeError
              ? "border-destructive/40 bg-destructive/10"
              : "border-border bg-background/95 backdrop-blur"
          )}
        >
          <div className="mx-auto flex max-w-[1440px] items-center gap-3">
            {writing ? (
              <>
                <IconLoader2 className="size-4 animate-spin text-primary" />
                <span className="font-mono text-sm">
                  Flattening the session timeline → LLM Gateway structured output…
                </span>
              </>
            ) : (
              <>
                <span className="font-mono text-sm text-destructive">{writeError}</span>
                <Link
                  href="/"
                  className="ml-auto font-mono text-xs underline underline-offset-4"
                >
                  back to incidents
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
