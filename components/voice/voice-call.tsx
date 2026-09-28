"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CallControls } from "@/components/voice/call-controls"
import { TranscriptPanel } from "@/components/voice/transcript-panel"
import type { TranscriptEntry, VoiceStatus } from "@/hooks/use-voice-session"
import type { ToolLogEntry } from "@/lib/types"

/** Left column of the war room: the live conversation plus call controls. */
export function VoiceCall({
  status,
  error,
  muted,
  analyser,
  soundOn,
  entries,
  toolLog,
  onStart,
  onEnd,
  onToggleMute,
  onToggleSound,
}: {
  status: VoiceStatus
  error: string | null
  muted: boolean
  analyser: AnalyserNode | null
  soundOn: boolean
  entries: TranscriptEntry[]
  toolLog: ToolLogEntry[]
  onStart: () => void
  onEnd: () => void
  onToggleMute: () => void
  onToggleSound: () => void
}) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <CardTitle>Voice war room</CardTitle>
        <CardDescription>
          AssemblyAI Voice Agent API — browser to WebSocket, no server-side audio
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <TranscriptPanel entries={entries} toolLog={toolLog} status={status} />
        <CallControls
          status={status}
          muted={muted}
          error={error}
          analyser={analyser}
          soundOn={soundOn}
          onStart={onStart}
          onEnd={onEnd}
          onToggleMute={onToggleMute}
          onToggleSound={onToggleSound}
        />
      </CardContent>
    </Card>
  )
}
