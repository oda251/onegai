import type { InputEntry } from "./types";
import { formatInputs, WORKER_PROTOCOL } from "./prompts";

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
  sections.push(WORKER_PROTOCOL);

  return sections.join("\n\n");
}
