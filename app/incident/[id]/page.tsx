import { WarRoom } from "@/components/war-room/war-room"

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <WarRoom incidentId={id} />
}
