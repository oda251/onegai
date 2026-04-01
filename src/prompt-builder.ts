import type { InputEntry, Citation } from "./types";

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
  sections.push(`## Protocol

inputs が不十分なら:
  echo "reject_reason=理由" >> $GITHUB_OUTPUT
  exit 1

完了したら outputs を GITHUB_OUTPUT に書き込む。

plain 出力:
  echo "key=value" >> $GITHUB_OUTPUT

evidenced 出力（情報源がある場合は必ずこの形式を使う）:
  cat >> $GITHUB_OUTPUT <<'OUTPUTEOF'
  key<<EOF
  {"type":"evidenced","body":"要約","citations":[{"type":"uri","source":"ファイルパスまたはURL","excerpt":"引用箇所"}]}
  EOF
  OUTPUTEOF`);

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
