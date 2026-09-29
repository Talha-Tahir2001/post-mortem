"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { IconMoon, IconSun } from "@tabler/icons-react"

const subscribe = () => () => {}

/** `false` during SSR and the first client render, so the icon cannot mismatch. */
function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  // Before mount the app default is dark, so the icon matches the SSR output.
  const dark = mounted ? resolvedTheme !== "light" : true

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title="Toggle theme (D)"
      disabled={!mounted}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <IconSun /> : <IconMoon />}
    </Button>
  )
}
