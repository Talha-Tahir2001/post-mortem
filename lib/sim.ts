import type { Deploy, ServiceName, ServiceState } from "@/lib/types"

export const BASE_SERVICES: Record<ServiceName, ServiceState> = {
  checkout: { status: "healthy", http_code: 200, p95_ms: 180, error_pct: 0.4 },
  api: { status: "healthy", http_code: 200, p95_ms: 120, error_pct: 0.2 },
  web: { status: "healthy", http_code: 200, p95_ms: 90, error_pct: 0.1 },
}

export const CHAOS_SERVICES: Record<ServiceName, ServiceState> = {
  checkout: { status: "failing", http_code: 502, p95_ms: 1450, error_pct: 18.6 },
  api: BASE_SERVICES.api,
  web: BASE_SERVICES.web,
}

export const DEPLOYS: Deploy[] = [
  {
    service: "checkout",
    hash: "a1b9f3e",
    message: "fix cart idempotency",
    author: "Priya",
    minutesAgo: 6,
    env: "prod",
  },
  {
    service: "checkout",
    hash: "c47d2b1",
    message: "bump cart service to 1.48.0",
    author: "Dev",
    minutesAgo: 61,
    env: "prod",
  },
  {
    service: "checkout",
    hash: "7e2f0aa",
    message: "add gift-card balance check",
    author: "Marco",
    minutesAgo: 190,
    env: "prod",
  },
  {
    service: "checkout",
    hash: "5b81c40",
    message: "tighten stripe webhook retries",
    author: "Priya",
    minutesAgo: 400,
    env: "prod",
  },
  {
    service: "checkout",
    hash: "e93a7d5",
    message: "rotate checkout secrets",
    author: "ops-bot",
    minutesAgo: 1180,
    env: "prod",
  },
  {
    service: "api",
    hash: "4f1c9de",
    message: "cache tenant feature flags",
    author: "Amara",
    minutesAgo: 24,
    env: "prod",
  },
  {
    service: "api",
    hash: "b7a3e12",
    message: "increase connection pool to 40",
    author: "Amara",
    minutesAgo: 150,
    env: "prod",
  },
  {
    service: "api",
    hash: "91d0b6c",
    message: "add rate-limit headers",
    author: "Jin",
    minutesAgo: 340,
    env: "prod",
  },
  {
    service: "api",
    hash: "2c8e5f7",
    message: "drop legacy /v1/users path",
    author: "Jin",
    minutesAgo: 900,
    env: "prod",
  },
  {
    service: "api",
    hash: "aa4b1e9",
    message: "upgrade fastify to 5.1",
    author: "Amara",
    minutesAgo: 1500,
    env: "staging",
  },
  {
    service: "web",
    hash: "d3f80a1",
    message: "shrink hero bundle",
    author: "Sofia",
    minutesAgo: 38,
    env: "prod",
  },
  {
    service: "web",
    hash: "6a2b7cc",
    message: "new pricing table",
    author: "Sofia",
    minutesAgo: 210,
    env: "prod",
  },
  {
    service: "web",
    hash: "ce10d94",
    message: "fix dark-mode flash",
    author: "Tom",
    minutesAgo: 520,
    env: "prod",
  },
  {
    service: "web",
    hash: "18b4f27",
    message: "lazy-load analytics",
    author: "Tom",
    minutesAgo: 1050,
    env: "prod",
  },
  {
    service: "web",
    hash: "70f3ac8",
    message: "bump next to 16.3.4",
    author: "Sofia",
    minutesAgo: 1620,
    env: "staging",
  },
]

export function servicesForChaos(chaos: boolean) {
  return chaos ? CHAOS_SERVICES : BASE_SERVICES
}

export function deploysFor(service?: ServiceName) {
  const list = service ? DEPLOYS.filter((d) => d.service === service) : DEPLOYS
  return [...list].sort((a, b) => a.minutesAgo - b.minutesAgo)
}

/** Deterministic windowed error rate: the 1h window lags a brand-new failure. */
export function errorRateFor(state: ServiceState, window: "5m" | "1h") {
  if (window === "5m") return state.error_pct
  const lagged = state.error_pct > 5 ? state.error_pct * 0.55 : state.error_pct * 0.9
  return Math.round(lagged * 10) / 10
}

export function formatAgo(minutesAgo: number) {
  if (minutesAgo < 1) return "just now"
  if (minutesAgo < 60) return `${minutesAgo} min ago`
  const hours = Math.floor(minutesAgo / 60)
  const minutes = minutesAgo % 60
  if (hours < 24) return minutes ? `${hours}h ${minutes}m ago` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
