import type { InputValue } from "@core/types";
import { formatInputs, OUTPUT_FORMAT_SPEC } from "./shared";

// Convention: section headers (## Task, ### Inputs, ...) are English as stable
// anchors; body text is Japanese.

const REJECT_INSTRUCTION = `入力が不十分な場合は reject:

    echo "reject_reason=理由" >> "$GITHUB_OUTPUT"
    exit 1`;

export function buildWorkerPrompt(
  body: string,
  inputs: Record<string, InputValue>,
  requiredOutputs: string[],
  workflowFile?: string,
): string {
  const sections: string[] = [];

  sections.push(`## Task

### Inputs

${formatInputs(inputs)}

${REJECT_INSTRUCTION}`);

  if (requiredOutputs.length > 0) {
    const outputLines = requiredOutputs.map((key) => `- **${key}**`).join("\n");
    sections.push(`### Outputs

完了時に以下のキーを GITHUB_OUTPUT に書き込む:

${outputLines}

${OUTPUT_FORMAT_SPEC}`);
  }

  if (workflowFile) {
    sections.push(`### Context\n\nWorkflow: \`${workflowFile}\``);
  }

  sections.push(`## Workflow\n\n${body}`);

  return sections.join("\n\n");
}
