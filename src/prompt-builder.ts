import type { InputEntry, Citation } from "./types.js";

export function buildWorkerPrompt(
  body: string,
  inputs: Record<string, InputEntry>,
  requiredOutputs: string[],
  workflowFile?: string,
): string {
  const sections = [
    `## Task\n\n### Inputs\n\n${formatInputs(inputs)}`,
  ];

  if (requiredOutputs.length > 0) {
    const outputLines = requiredOutputs.map((key) => `- **${key}**`).join("\n");
    sections.push(`### Outputs\n\n完了時に以下を GITHUB_OUTPUT に書き込む:\n\necho "key=value" >> $GITHUB_OUTPUT\n\n${outputLines}`);
  }

  if (workflowFile) {
    sections.push(`### Context\n\nWorkflow: \`${workflowFile}\``);
  }

  sections.push(`## Workflow\n\n${body}`);
  sections.push(`## Protocol\n\ninputs が不十分なら:\n  echo "reject_reason=理由" >> $GITHUB_OUTPUT\n  exit 1\n\n完了したら outputs を GITHUB_OUTPUT に書き込む。`);

  return sections.join("\n\n");
}

function formatInputs(inputs: Record<string, InputEntry>): string {
  return Object.entries(inputs)
    .map(([key, entry]) => {
      if (entry.type === "plain") return `- **${key}**: ${entry.value}`;
      const lines = [`- **${key}**: ${entry.body}`];
      for (const c of entry.citations) {
        lines.push(`  - source: \`${citationSource(c)}\` — "${c.excerpt}"`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function citationSource(c: Citation): string {
  switch (c.type) {
    case "transcript": return "(transcript)";
    case "command": return c.command;
    case "uri": return c.source;
  }
}
