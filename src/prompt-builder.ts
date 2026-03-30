import type { Workflow, InputEntry, Citation } from "./types.js";

export function buildWorkerPrompt(
  workflow: Workflow,
  inputs: Record<string, InputEntry>,
  taskId: string,
  transcriptPath?: string,
): string {
  const sections: string[] = [];

  sections.push(`## Intent Gate

タスク内容と inputs を確認し、要件が不十分なら reject で差し戻す。
reject: sidekick の reject ツール（taskId: "${taskId}", reason: "理由"）

## 完了プロトコル

done: sidekick の done ツール（taskId: "${taskId}"${formatOutputHint(workflow.outputs)}）
reject: sidekick の reject ツール（taskId: "${taskId}", reason: "理由"）

タスクID: ${taskId}`);

  const inputLines = Object.entries(inputs)
    .map(([key, entry]) => formatInput(key, entry, transcriptPath))
    .join("\n\n");
  sections.push(`## Inputs\n\n${inputLines}`);

  if (Object.keys(workflow.outputs).length > 0) {
    const outputLines = Object.entries(workflow.outputs)
      .map(([key, desc]) => `- **${key}**: ${desc}`)
      .join("\n");
    sections.push(`## 完了時に返す Outputs\n\n${outputLines}`);
  }

  sections.push(`## ワークフロー\n\n${workflow.body}`);

  return sections.join("\n\n");
}

function formatInput(key: string, entry: InputEntry, transcriptPath?: string): string {
  if (entry.type === "plain") {
    return `- **${key}**: ${entry.value}`;
  }

  const lines = [`- **${key}**: ${entry.body}`];
  if (entry.citations && entry.citations.length > 0) {
    for (const citation of entry.citations) {
      const source = resolveSource(citation, transcriptPath);
      if (citation.excerpt) {
        lines.push(`  - 出典: \`${source}\` — "${citation.excerpt}"`);
      } else {
        lines.push(`  - 出典: \`${source}\``);
      }
    }
  }
  return lines.join("\n");
}

function resolveSource(citation: Citation, transcriptPath?: string): string {
  if (citation.type === "transcript") {
    return transcriptPath ?? "(transcript path not registered)";
  }
  return citation.source;
}

function formatOutputHint(outputs: Record<string, string>): string {
  const keys = Object.keys(outputs);
  if (keys.length === 0) return "";
  return `, output: {${keys.map((k) => ` ${k}: "..." `).join(",")}}`;
}
