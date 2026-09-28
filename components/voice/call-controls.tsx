"use client"

import { Button } from "@/components/ui/button"
import { MicLevel } from "@/components/voice/mic-level"
import { cn } from "@/lib/utils"
import type { VoiceStatus } from "@/hooks/use-voice-session"
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneOff,
  IconPlayerPlay,
  IconVolume2,
  IconVolumeOff,
} from "@tabler/icons-react"

export function CallControls({
  status,
  muted,
  error,
  analyser,
  soundOn,
  onStart,
  onEnd,
  onToggleMute,
  onToggleSound,
  className,
}: {
  status: VoiceStatus
  muted: boolean
  error: string | null
  analyser: AnalyserNode | null
  soundOn: boolean
  onStart: () => void
  onEnd: () => void
  onToggleMute: () => void
  onToggleSound: () => void
  className?: string
}) {
  if (status === "ready") {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleMute}
          aria-label={muted ? "Unmute microphone" : "Mute microphone"}
          className={cn(muted && "border-destructive/50 text-destructive")}
        >
          {muted ? <IconMicrophoneOff /> : <IconMicrophone />}
        </Button>

        <div className="flex min-w-32 flex-1 items-center gap-2.5 rounded-md border border-border bg-background/40 px-3 py-1.5">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span className="hidden font-mono text-xs text-emerald-500 sm:block">on the call</span>
          <MicLevel analyser={analyser} active className="h-5 flex-1" />
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={onToggleSound}
          aria-label={soundOn ? "Mute call sounds" : "Unmute call sounds"}
          className={cn(!soundOn && "text-muted-foreground")}
        >
          {soundOn ? <IconVolume2 /> : <IconVolumeOff />}
        </Button>

        <Button variant="destructive" onClick={onEnd} className="font-mono">
          <IconPhoneOff />
          End incident
        </Button>
      </div>
    )
  }

  if (status === "connecting") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button disabled className="flex-1 font-mono">
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Opening the line…
        </Button>
      </div>
    )
  }

  if (status === "ended") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="flex-1 rounded-md border border-border bg-background/40 px-3 py-2 font-mono text-xs text-muted-foreground">
          call ended — session recorded
        </span>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {error}
        </p>
      )}
      <Button onClick={onStart} size="lg" className="w-full font-mono">
        <IconPlayerPlay />
        {status === "error" ? "Retry call" : "Start call"}
      </Button>
    </div>
  )
}
