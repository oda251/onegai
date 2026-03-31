---
tags:
  - decision
  - sidekick
  - v2
  - specification
---
# sidekick v2 仕様

depends-on:
- [sidekick 設計思想](./2026-03-30-dec-sidekick-design-philosophy.md)
- [Jobs / Steps アーキテクチャ](./2026-03-31-con-jobs-steps-architecture.md)

## 概要

sidekick v2 は外部依存（actrun, MCP）を排し、自前で workflow を実行するスタンドアロンツール。メインエージェントが Bash ツールで直接呼び出す。

## アーキテクチャ

```
メインエージェント
  → Bash("sidekick run .claude/workflows/dev/implement.yml")
  → sidekick が DAG 解決、job/step を実行
    → run: step → シェルコマンド
    → skill: step → Claude Agent SDK（プロセス分離）
  ← exit code + stdout
```

外部依存: Claude Agent SDK のみ。MCP サーバーなし。

## ファイル構成

```
.claude/
  workflows/           # ワークフロー定義
    dev/
      implement.yml
  skills/              # スキル定義
    dev/
      impl.md
      review.md
  hooks/
    inject-workflows.sh   # UserPromptSubmit: ワークフロー一覧をコンテキストに注入
    register-transcript.sh # SessionStart: TRANSCRIPT_PATH を環境変数に
```

## ワークフロー定義 (.yml)

```yaml
name: Implement and review

jobs:
  implement:
    steps:
      - skill: dev/impl
        id: impl
      - skill: dev/review
        inputs:
          changes: ${{ steps.impl.outputs.changes }}

  lint:
    steps:
      - run: bun run lint

  test:
    steps:
      - run: bun test

  integrate:
    needs: [implement, lint, test]
    steps:
      - run: echo "All checks passed"
```

### ワークフローの要素

| 要素 | 説明 |
|---|---|
| `name` | ワークフロー名 |
| `jobs` | 並列実行の単位。`needs` で依存関係を宣言 |
| `steps` | 直列実行の単位。`skill:` または `run:` |
| `needs` | 依存する job の配列。全完了後に開始 |

### step の種類

| 種類 | 記法 | 実行方法 |
|---|---|---|
| skill | `skill: dev/impl` | Claude Agent SDK でワーカーを起動 |
| command | `run: bun run lint` | シェルコマンドを直接実行 |

### step 間の I/O

- `id` で step に名前を付ける
- `${{ steps.<id>.outputs.<key> }}` で前の step の output を参照
- 参照は sidekick が文字列置換で解決してから次の step に渡す

## スキル定義 (.md)

```yaml
# .claude/skills/dev/impl.md
---
provider: claude
model: sonnet
tools: [Read, Edit, Write, Bash, Glob, Grep]
permission-mode: auto
inputs:
  what: 実装内容
  where:
    description: 対象ファイル
    type: plain
---

指定されたファイルに対して実装を行う。
```

### フロントマター

| フィールド | デフォルト | 説明 |
|---|---|---|
| `provider` | `claude` | LLM プロバイダ |
| `model` | プロバイダのデフォルト | モデル名（alias: `sonnet`, `opus` 等） |
| `tools` | 全許可 | ワーカーに許可するツール |
| `permission-mode` | `auto` | ワーカーの権限モード |
| `inputs` | （必須） | 入力パラメータの宣言 |

### input の型

| 型 | 説明 | エビデンス検証 |
|---|---|---|
| `plain` | ファイルパス、単純な値 | なし |
| `evidenced` | 要件、仕様。citation 必須 | あり |

短縮形（`key: 説明`）は `type: evidenced` として扱う。

### outputs

スキルは outputs を宣言しない。sidekick がワークフローの配線（`${{ steps.<id>.outputs.<key> }}`）を解析し、後続 step で参照されている output キーを逆算してワーカーのプロンプトに含める。

ワーカーは `echo "key=value" >> $GITHUB_OUTPUT` で output を書き込む（GHA 互換）。

## 構造化 inputs

メインエージェントからワークフローに渡す inputs:

```json
{
  "what": {
    "type": "evidenced",
    "body": "JWT に移行する",
    "citations": [
      { "type": "transcript", "excerpt": "セッションを切りたくない" },
      { "type": "uri", "source": "src/auth/session.ts", "excerpt": "app.use(session(...))" }
    ]
  },
  "where": {
    "type": "plain",
    "value": "src/auth/"
  }
}
```

### Citation の種類

| type | source | 検証 |
|---|---|---|
| `transcript` | TRANSCRIPT_PATH 環境変数 | grep |
| `uri` | ファイルパスまたは URL | テキストなら grep、URL なら HEAD |
| `command` | シェルコマンド | 素通し |

## Intent Gate

skill step 実行前に evidenced inputs の citation を検証する。

1. 各 evidenced input の citations を走査
2. excerpt が source に実在するかチェック
3. 失敗 → step を実行せずにエラー（exit 1）
4. メインエージェントが `sidekick run view <run-id>` で理由を確認し、inputs を修正して再実行

## ワーカープロンプト

sidekick が skill step 実行時に自動生成するプロンプト:

```markdown
## Task

### Inputs

- **what**: JWT に移行する
  - source: `src/auth/session.ts` — "app.use(session(...))"
- **where**: src/auth/

### Outputs

完了時に以下を GITHUB_OUTPUT に書き込む:
echo "key=value" >> $GITHUB_OUTPUT

- **changes**

### Context

Workflow: `.claude/workflows/dev/implement.yml`

## Workflow

（skill .md の本文）

## Protocol

inputs が不十分なら:
  echo "reject_reason=理由" >> $GITHUB_OUTPUT
  exit 1

完了したら outputs を GITHUB_OUTPUT に書き込む。
```

## DAG 解決

sidekick が自前で実装:

1. `needs` のない job → 即座に開始
2. `needs` が全て完了した job → 開始
3. job 内の steps は直列実行
4. job が失敗 → 依存する job はスキップ

## メインエージェント向けワークフロー一覧

`inject-workflows.sh` hook（UserPromptSubmit）が `sidekick inspect` コマンドを呼び、各ワークフローの required inputs を自動計算してコンテキストに注入:

```
利用可能なワークフロー:
- .claude/workflows/dev/implement.yml: Implement and review (inputs: what[evidenced], where[plain])
```

required inputs = 全 skill の inputs の和集合 − 配線で供給される inputs

## メインエージェントプロンプト

```markdown
該当するワークフローがあれば sidekick run で実行する。
ワークフロー定義の required inputs を全て埋められるなら委譲できる。
埋められないなら、まだ委譲しない。ユーザーに聞いて情報を引き出す。

ワークフローを投入したら、完了を待たずに会話を続ける。
残っている観点や未解決の論点を自ら検討し、ユーザーからも引き出す。

失敗したら sidekick run view で状態を確認し、理由をユーザーに報告して
ネクストアクションを相談する。
```

## CLI

```
sidekick run <workflow.yml>               ワークフロー実行
sidekick run view <run-id> [--json]       実行状態の確認
sidekick run logs <run-id>                ログ表示
sidekick inspect <workflow.yml>           required inputs をJSON で出力
sidekick lint [--dir path]                スキル定義の検証
sidekick setup                            hooks とスキルをプロジェクトにインストール
```

## MCP が不要な理由

メインエージェントが Bash ツールで `sidekick run` を呼べば、実行完了時にプロセスが終了して結果が返る。MCP の非同期通知は不要。状態確認も `sidekick run view` で CLI から取得できる。MCP サーバーを常駐させる理由がない。

## 不要になったもの

- MCP サーバー（CLI で完結する）
- done/reject ツール（GHA 互換の GITHUB_OUTPUT + exit code）
- task-store / DB（run store をファイルベースで管理）
- actrun 依存（DAG 解決を自前実装）
- caller-scoped 通知（CLI の stdout で返る）
