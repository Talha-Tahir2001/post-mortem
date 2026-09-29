"use client"

import type { ComponentProps, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { IconPlayerPlay } from "@tabler/icons-react"

type Props = Omit<ComponentProps<typeof Button>, "onClick" | "children"> & {
  children?: ReactNode
}

export function StartIncidentButton({ children, ...props }: Props) {
  const router = useRouter()

  function start() {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    router.push(`/incident/${id}`)
  }

  return (
    <Button size="lg" onClick={start} {...props}>
      <IconPlayerPlay />
      {children ?? "Start incident"}
    </Button>
  )
}
