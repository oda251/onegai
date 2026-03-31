---
tags:
  - decision
  - sidekick
  - actrun
  - architecture
---
# actrun 統合設計

depends-on:
- [sidekick 設計思想](./2026-03-30-dec-sidekick-design-philosophy.md)
- [Jobs / Steps アーキテクチャ](./2026-03-31-con-jobs-steps-architecture.md)

## 背景

sidekick の jobs/steps アーキテクチャは GHA と同じ構造に行き着いた。[mizchi/actrun](https://github.com/mizchi/actrun) は GHA 互換のローカルランナーで、DAG 解決・コマンド実行・job 間データ伝播が実装済み。

## 方針: actrun フォーク + skill step

MCP サーバーは不要と判明。メインエージェントが Bash ツールで `actrun workflow.yml` を直接実行すれば、完了時に結果が返る。MCP を挟む理由がない。

### 構成

```
メインエージェント
  → Bash("actrun .claude/workflows/implement.yml")
  → actrun が DAG 解決、job/step を順次実行
    → run: step → シェルコマンド
    → uses: ./actions/skill → Intent Gate + Claude Agent SDK
  ← exit code + stdout（結果）
```

### actrun フォーク（oda251/actrun feat/skill-step）

actrun に `actions/skill/` を同梱。ローカル Node action として:

- `.claude/skills/<name>.md` を読み、frontmatter からプロバイダ・モデル・ツール・outputs を取得
- Intent Gate: evidenced inputs の citation を検証
- Claude Agent SDK でワーカーを起動
- GHA 標準 I/O: `INPUT_*` 環境変数 + `GITHUB_OUTPUT`

### ワークフロー定義

`.claude/workflows/` に GHA 互換の `.yml` を置く:

```yaml
jobs:
  impl:
    runs-on: local
    steps:
      - uses: ./actions/skill
        id: impl
        with:
          skill: dev/impl
          inputs: '{"what": {"type": "evidenced", ...}, "where": {"type": "plain", ...}}'
      - uses: ./actions/skill
        with:
          skill: dev/review
          inputs: '${{ steps.impl.outputs.changes }}'
  lint:
    steps:
      - run: bun run lint
  integrate:
    needs: [impl, lint]
    steps:
      - run: echo "done"
```

### スキル定義

`.claude/skills/<domain>/<name>.md`:

```yaml
---
provider: claude
model: sonnet
tools: [Read, Edit, Write]
inputs:
  what: 実装内容
  where:
    description: 対象ファイル
    type: plain
outputs:
  changes: 変更したファイル一覧
---

（ワーカーへの作業指示）
```

## 決定事項

- **MCP は不要**: メインエージェントが actrun CLI を直接叩く
- **DAG は actrun に全委譲**: actrun がワークフロー全体を実行
- **Intent Gate は skill action の責務**: citation 検証は step 実行前に行う
- **I/O は GHA 標準**: `INPUT_*` / `GITHUB_OUTPUT` / exit code
- **reject は `reject_reason` output + exit 1**: メインエージェントが `actrun run view --json` で理由を取得し、`--job --step` で途中再開
- **ワークフロー配置**: `.claude/workflows/`
- **スキル配置**: `.claude/skills/`
- **transcript_path**: `TRANSCRIPT_PATH` 環境変数経由

## 不要になったもの

- actrun-mcp（アーカイブ済み）
- skill-action 独立リポジトリ（アーカイブ済み、actrun fork に同梱）
- sidekick の MCP サーバー、タスクストア、DB、done/reject ツール
