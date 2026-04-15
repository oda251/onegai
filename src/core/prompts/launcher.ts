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

全ての入力が揃ったら、以下の形式でワークフローを実行する:

    onegai run ${workflowPath} --input 'key1=value1' --input 'key2=value2'

重要: \`key=value\` 全体を必ずシングルクォートで囲む。値にスペースやシェルメタ文字が含まれても argv 分割で壊れないため。

#### plain 入力

値をそのまま渡す:

    onegai run ${workflowPath} --input 'where=src/auth.ts' --input 'what=add JWT auth flow'

#### evidenced 入力

excerpt に引用符や改行が含まれるとシェル上での JSON リテラル組み立てが壊れやすい。\`node -e\` で JSON を生成し、変数経由で渡す:

    WHAT_JSON=$(node -e 'process.stdout.write(JSON.stringify({type:"evidenced",body:"JWT 認証に移行",citations:[{type:"uri",source:"src/auth.ts",excerpt:"jwt.sign()"}]}))')
    onegai run ${workflowPath} --input "what=$WHAT_JSON"

citation の種類:
- transcript 由来: \`{"type":"transcript","excerpt":"..."}\`
- ファイル/URL 由来: \`{"type":"uri","source":"path","excerpt":"..."}\`

\`cli.ts\` は \`JSON.parse\` 失敗時に silent に plain へフォールバックする。evidenced を意図した入力が plain として渡ると skill 側で type mismatch になるため、JSON の妥当性に注意すること。`);

  return sections.join("\n\n");
}
