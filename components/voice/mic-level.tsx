"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

const BAR_COUNT = 28

/**
 * Live microphone spectrum drawn straight to a canvas from the session's
 * AnalyserNode — no React re-renders while it animates.
 */
export function MicLevel({
  analyser,
  active,
  className,
}: {
  analyser: AnalyserNode | null
  active: boolean
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    let frame = 0
    let colorFrame = 0
    let color = "rgb(16, 185, 129)"
    const values = new Uint8Array(analyser?.frequencyBinCount ?? 128)

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(rect.width * ratio))
      canvas.height = Math.max(1, Math.round(rect.height * ratio))
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const draw = () => {
      frame = window.requestAnimationFrame(draw)

      const width = canvas.width
      const height = canvas.height
      const ratio = window.devicePixelRatio || 1
      context.clearRect(0, 0, width, height)

      if (colorFrame++ % 15 === 0) {
        color = getComputedStyle(canvas).color || color
      }
      context.fillStyle = color

      const slot = width / BAR_COUNT
      const barWidth = Math.max(2 * ratio, slot * 0.55)

      if (active && analyser) {
        analyser.getByteFrequencyData(values)
        const slice = Math.max(1, Math.floor(values.length / BAR_COUNT))

        for (let index = 0; index < BAR_COUNT; index++) {
          let peak = 0
          for (let offset = 0; offset < slice; offset++) {
            const value = values[index * slice + offset] ?? 0
            if (value > peak) peak = value
          }
          const strength = peak / 255
          const barHeight = Math.max(2 * ratio, strength * height)
          const x = index * slot + (slot - barWidth) / 2
          const y = height - barHeight
          context.globalAlpha = 0.25 + strength * 0.75
          context.beginPath()
          context.roundRect(x, y, barWidth, barHeight, barWidth / 2)
          context.fill()
        }
        context.globalAlpha = 1
      } else {
        // Idle: a calm baseline so the meter still reads as a live surface.
        context.globalAlpha = 0.4
        const baseline = height / 2
        context.beginPath()
        context.roundRect(0, baseline - ratio, width, 2 * ratio, ratio)
        context.fill()
        context.globalAlpha = 1
      }
    }

    frame = window.requestAnimationFrame(draw)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [analyser, active])

  return <canvas ref={canvasRef} aria-hidden className={cn("min-w-0", className)} />
}
