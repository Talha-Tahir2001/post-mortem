"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FindingsCards } from "@/components/report/findings-cards"
import { SessionTranscript } from "@/components/report/session-transcript"
import { Timeline } from "@/components/report/timeline"
import { SeverityBadge } from "@/components/war-room/severity-badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { downloadMarkdown, markdownFilename, postmortemToMarkdown } from "@/lib/markdown"
import { requestPostmortem } from "@/lib/report-client"
import type { IncidentFacts, Postmortem } from "@/lib/postmortem-schema"
import type { TimelineMessage } from "@/lib/timeline"
import {
  loadReport,
  loadReportContext,
  saveReport,
  saveReportContext,
} from "@/lib/storage"
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconFileDownload,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react"

interface ReportState {
  facts: IncidentFacts
  postmortem: Postmortem
}

export function PostmortemView({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [report, setReport] = useState<ReportState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<"llm" | "fallback">("llm")
  const [sourceDetail, setSourceDetail] = useState<string | null>(null)
  const [tab, setTab] = useState<"findings" | "transcript">("findings")
  const [transcript, setTranscript] = useState<TimelineMessage[] | null>(null)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const transcriptRequested = useRef(false)

  const loadTranscript = useCallback(async () => {
    if (transcriptRequested.current) return
    transcriptRequested.current = true
    setTranscriptLoading(true)
    setTranscriptError(null)

    try {
      const response = await fetch(
        `/api/transcript?sessionId=${encodeURIComponent(sessionId)}`
      )
      const payload = (await response.json()) as {
        messages?: TimelineMessage[]
        error?: string
      }
      if (!response.ok) {
        throw new Error(payload.error ?? `Transcript request failed (${response.status})`)
      }
      setTranscript(payload.messages ?? [])
    } catch (cause) {
      setTranscriptError(
        cause instanceof Error ? cause.message : "Could not load the transcript."
      )
    } finally {
      setTranscriptLoading(false)
    }
  }, [sessionId])

  const toMarkdown = useCallback(() => {
    if (!report) return null
    return postmortemToMarkdown(report.postmortem, report.facts, sessionId)
  }, [report, sessionId])

  const handleCopy = useCallback(async () => {
    const markdown = toMarkdown()
    if (!markdown) return
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }, [toMarkdown])

  const handleDownload = useCallback(() => {
    const markdown = toMarkdown()
    if (!markdown || !report) return
    downloadMarkdown(markdownFilename(report.postmortem.title), markdown)
  }, [report, toMarkdown])

  const generate = useCallback(
    async (options?: { silent?: boolean }) => {
      const context = loadReportContext(sessionId)
      if (!options?.silent) setLoading(true)
      setError(null)
      // Artifacts may have changed too — re-read the transcript when we can.
      transcriptRequested.current = false
      setTranscript(null)
      setTranscriptError(null)
      if (tab === "transcript") void loadTranscript()

      try {
        const result = await requestPostmortem({
          sessionId,
          title: context?.title ?? "Incident " + sessionId.slice(-6),
          severity: context?.severity ?? null,
          actionItems: context?.actionItems ?? [],
        })

        const cached = {
          facts: result.facts,
          postmortem: result.postmortem,
          cachedAt: Date.now(),
          source: result.source,
          source_detail: result.source_detail,
        }
        saveReport(sessionId, cached)
        setReport(cached)
        setSource(result.source)
        setSourceDetail(result.source_detail ?? null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not build the report.")
      } finally {
        setLoading(false)
      }
    },
    [sessionId, tab, loadTranscript]
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const cached = loadReport(sessionId)
      if (cached?.postmortem) {
        if (cancelled) return
        setReport({ facts: cached.facts, postmortem: cached.postmortem })
        setSource(cached.source ?? "llm")
        setSourceDetail(cached.source_detail ?? null)
        setLoading(false)
        return
      }
      if (cancelled) return
      await generate()
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, generate])

  // Keep a usable context around even when the report was opened from history.
  useEffect(() => {
    if (!loadReportContext(sessionId)) {
      saveReportContext(sessionId, { title: "", severity: null, actionItems: [] })
    }
  }, [sessionId])

  if (loading && !report) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-16">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-40" />
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" />
          fetching session timeline → LLM Gateway structured output…
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16">
        <h1 className="font-heading text-2xl font-medium">Report unavailable</h1>
        <p className="text-sm text-destructive">{error}</p>
        <div className="flex gap-2">
          <Button onClick={() => void generate()}>Try again</Button>
          <Button variant="outline" onClick={() => router.push("/")}>
            Back to incidents
          </Button>
        </div>
      </div>
    )
  }

  const { postmortem, facts } = report

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/"
          className="inline-flex size-8 items-center justify-center rounded-md border border-border hover:bg-muted"
          aria-label="Back to incidents"
        >
          <IconArrowLeft className="size-4" />
        </Link>
        <Badge variant="outline" className="font-mono text-[10px] tracking-widest uppercase">
          postmortem
        </Badge>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {source === "llm" ? "LLM Gateway · structured output" : "offline fallback"}
        </Badge>
        {source === "fallback" && sourceDetail ? (
          <span className="min-w-0 basis-full font-mono text-[11px] text-muted-foreground">
            {sourceDetail}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => void generate({ silent: true })}
        >
          <IconRefresh />
          <span className="hidden sm:inline">Regenerate</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
          {copied ? <IconCheck className="text-emerald-500" /> : <IconCopy />}
          <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDownload}>
          <IconFileDownload />
          <span className="hidden sm:inline">Markdown</span>
        </Button>
        <ThemeToggle />
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SeverityBadge level={postmortem.severity} />
          <span className="font-mono text-xs text-muted-foreground">
            {facts.session_id ?? sessionId}
          </span>
        </div>
        <h1 className="font-heading text-3xl leading-tight font-medium tracking-tight text-balance sm:text-4xl">
          {postmortem.title}
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
          {postmortem.summary}
        </p>
      </section>

      <Tabs
        value={tab}
        onValueChange={(next) => {
          const value = next === "transcript" ? "transcript" : "findings"
          setTab(value)
          if (value === "transcript") void loadTranscript()
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
        </TabsList>

        <TabsContent value="findings" className="flex flex-col gap-6 pt-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Impact</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              {postmortem.impact}
            </CardContent>
          </Card>

          <section className="flex flex-col gap-4">
            <h2 className="font-heading text-xl font-medium">Timeline</h2>
            <Timeline entries={postmortem.timeline} facts={facts} />
          </section>

          <FindingsCards postmortem={postmortem} />
        </TabsContent>

        <TabsContent value="transcript" className="flex flex-col gap-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Raw session transcript — you, the agent, and every tool call with its result.
            </p>
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              {facts.turn_count} turns · {facts.tool_calls.length} tool calls
            </span>
          </div>
          <SessionTranscript
            messages={transcript ?? []}
            loading={transcriptLoading}
            error={transcriptError}
          />
        </TabsContent>
      </Tabs>

      <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
        Written from the voice session timeline — hard facts from AssemblyAI, narrative from the
        LLM Gateway. Client-captured action items and severity are the source of truth.
      </footer>
    </div>
  )
}
