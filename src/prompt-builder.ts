import type { Workflow, InputEntry, Citation } from "./types.js";

export function buildWorkerPrompt(
  workflow: Workflow,
  inputs: Record<string, InputEntry>,
  taskId: string,
  transcriptPath?: string,
): string {
  const sections: string[] = [];

  sections.push(`## 共通フロー

1. タスク内容と inputs を確認する
2. 要件不足 → sidekick の reject ツールを呼ぶ（taskId: "${taskId}", reason: "理由"）
3. 実行する（以下のワークフローに従う）
4. セルフレビュー
5a. OK → sidekick の done ツールを呼ぶ（taskId: "${taskId}"${formatOutputHint(workflow.outputs)}）
5b. 問題あり → sidekick の reject ツールを呼ぶ（taskId: "${taskId}", reason: "理由"）

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
