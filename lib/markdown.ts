import { describeRole } from "@/lib/timeline"
import type { IncidentFacts, Postmortem } from "@/lib/postmortem-schema"

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim()
}

function bulletList(items: string[], fallback: string): string[] {
  if (!items.length) return [`- ${fallback}`]
  return items.map((item) => `- ${item}`)
}

/** Render a postmortem as clean GitHub-flavoured Markdown. */
export function postmortemToMarkdown(
  postmortem: Postmortem,
  facts: IncidentFacts,
  sessionId: string
): string {
  const meta = [
    `**Severity:** ${postmortem.severity}`,
    `**Session:** \`${facts.session_id ?? sessionId}\``,
    facts.duration_seconds !== null
      ? `**Duration:** ${Math.round(facts.duration_seconds)}s`
      : null,
    `**Turns:** ${facts.turn_count}`,
    `**Generated:** ${new Date().toISOString().slice(0, 10)}`,
  ].filter(Boolean)

  const lines: string[] = [
    `# ${postmortem.title}`,
    "",
    meta.join(" · "),
    "",
    "## Summary",
    "",
    postmortem.summary,
    "",
    "## Impact",
    "",
    postmortem.impact,
    "",
    "## Timeline",
    "",
    "| When | Actor | Event |",
    "| --- | --- | --- |",
    ...postmortem.timeline.map(
      (entry) =>
        `| ${cell(entry.when)} | ${cell(describeRole(entry.actor))} | ${cell(entry.event)} |`
    ),
    "",
    "## Root cause hypotheses",
    "",
    ...bulletList(
      postmortem.root_cause_hypotheses,
      "No hypotheses were established during the call."
    ),
    "",
    "## Action items",
    "",
    ...bulletList(
      postmortem.action_items.map(
        (item) => `[ ] ${item.task}${item.owner ? ` — ${item.owner}` : ""}`
      ),
      "No action items were captured."
    ),
    "",
    "## What went well",
    "",
    ...bulletList(postmortem.went_well, "No observations recorded."),
    "",
    "## What went poorly",
    "",
    ...bulletList(postmortem.went_poorly, "No observations recorded."),
    "",
    "---",
    "",
    "Written by Post Mortem from an AssemblyAI voice session transcript.",
  ]

  return lines.join("\n")
}

export function markdownFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${slug || "postmortem"}.md`
}

export function downloadMarkdown(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
