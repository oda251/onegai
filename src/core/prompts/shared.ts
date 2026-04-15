import type { InputValue, Citation } from "@core/types";

// heredoc 例は先頭インデント無しで書く。parseGithubOutputContent の正規表現が
// `^(\w+)<<` で行頭固定のため、書き込まれる内容もインデント無しでなければならない。
export const OUTPUT_FORMAT_SPEC = `plain 出力:

    echo "key=value" >> "$GITHUB_OUTPUT"

evidenced 出力（情報源がある場合は必ずこの形式を使う）。以下をそのまま行頭から書き込む:

cat >> "$GITHUB_OUTPUT" <<'OUTPUTEOF'
key<<EOF
{"type":"evidenced","body":"要約","citations":[{"type":"uri","source":"ファイルパスまたはURL","excerpt":"引用箇所"}]}
EOF
OUTPUTEOF`;

export function formatInputs(inputs: Record<string, InputValue>): string {
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
