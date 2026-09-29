import { PostmortemView } from "@/components/report/postmortem-view"

export default async function PostmortemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <PostmortemView sessionId={id} />
}
