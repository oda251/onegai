import { OUTPUT_FORMAT_SPEC } from "./shared";

interface RequiredInput {
  key: string;
  type: string;
  description: string;
}

export function buildInteractiveLaunchPrompt(
  workflowPath: string,
  requiredInputs: RequiredInput[],
): string {
  const sections: string[] = [];

  sections.push(`## 対話的入力収集

対象ワークフロー: \`${workflowPath}\``);

  if (requiredInputs.length > 0) {
    const inputLines = requiredInputs
      .map((i) => `- **${i.key}** (${i.type}): ${i.description}`)
      .join("\n");
    sections.push(`### 必要な入力

以下の入力をユーザーとの対話で収集せよ:

${inputLines}`);
  }

  sections.push(`### 実行

全ての入力が揃ったら、各入力を GITHUB_OUTPUT に書き込み、onegai run でワークフローを実行せよ。

${OUTPUT_FORMAT_SPEC}`);

  return sections.join("\n\n");
}
