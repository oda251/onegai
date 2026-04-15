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

全ての入力が揃ったら、以下のコマンドでワークフローを実行する:

    onegai run ${workflowPath} --input key1=<value1> --input key2=<value2> ...

- plain 入力: 値をそのまま渡す（例: \`--input where=src/auth.ts\`）
- evidenced 入力: JSON 文字列をそのまま渡す（例: \`--input what='{"type":"evidenced","body":"...","citations":[...]}'\`）

evidenced の citations は、ユーザーの発言やファイル内容から構築する。transcript 由来なら \`{"type":"transcript","excerpt":"..."}\`、ファイル/URL 由来なら \`{"type":"uri","source":"path","excerpt":"..."}\`。`);

  return sections.join("\n\n");
}
