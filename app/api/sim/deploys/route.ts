import { NextRequest, NextResponse } from "next/server"
import { deploysFor } from "@/lib/sim"
import { SERVICES, type ServiceName } from "@/lib/types"

export const runtime = "nodejs"

/**
 * Target of the agent's `get_recent_deploys` HTTP tool.
 * HTTP tools pass GET arguments as query parameters, hence `?service=`.
 * Stateless and secret-free by design so it works on Vercel.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("service")
  const service = SERVICES.includes(raw as ServiceName) ? (raw as ServiceName) : undefined

  return NextResponse.json({
    service: service ?? "all",
    generated_at: new Date().toISOString(),
    deploys: deploysFor(service),
  })
}
