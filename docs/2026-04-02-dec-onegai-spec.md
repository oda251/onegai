---
tags:
  - decision
  - onegai
  - specification
  - v0.1
---
# onegai 仕様 (v0.1)

depends-on:
- [設計思想](./2026-03-30-dec-sidekick-design-philosophy.md)
- [Jobs / Steps アーキテクチャ](./2026-03-31-con-jobs-steps-architecture.md)

## 概要

onegai は宣言的ワークフローオーケストレーター。YAML でジョブとステップを定義し、DAG ベースの依存解決で実行する。スキルステップはプロセス分離されたワーカーを起動する。

## CLI

```
onegai run <workflow> [--input key=json]   ワークフロー実行
onegai <workflow>                          run のショートカット
onegai inspect <workflow>                  required inputs を JSON で出力
onegai workflows [--context]               利用可能なワークフロー一覧
onegai view <run-id> [--json]              実行結果の確認
```

### ワークフロー名解決

ワークフローディレクトリ（`.claude/workflows/`）内を検索し、セグメント単位の後方一致で解決する。

```bash
onegai dev/implement       # .claude/workflows/dev/implement.yml
onegai implement           # 後方一致で dev/implement.yml にマッチ
```

完全一致を優先し、次に最初の後方一致を採用する。部分セグメントにはマッチしない（`plement` → 不一致）。

## ファイル構成

```
.claude/
  workflows/     # ワークフロー定義 (.yml)
  skills/        # スキル定義 (.md)
  hooks/         # Claude Code hooks
```

スキル解決順: プロジェクト `.claude/skills/` → リポジトリルート → `~/.claude/skills/`

## ワークフロー定義

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
  integrate:
    needs: [implement, lint]
    steps:
      - run: echo "All checks passed"
```

| 要素 | 説明 |
|---|---|
| `name` | ワークフロー名 |
| `jobs` | 並列実行の単位。`needs` で依存関係を宣言 |
| `steps` | ジョブ内で直列実行。`skill:` または `run:` |
| `needs` | 依存するジョブの配列。全完了後に開始 |

### ステップの種類

| 種類 | 記法 | 実行方法 |
|---|---|---|
| skill | `skill: dev/impl` | プロセス分離されたワーカーを起動 |
| run | `run: bun run lint` | シェルコマンドを直接実行 |

### DAG 解決

1. `needs` のないジョブ → 即座に開始
2. `needs` が全て完了したジョブ → 開始
3. ジョブ内のステップは直列実行
4. ジョブが失敗 → 依存するジョブはスキップ

## スキル定義

```yaml
# .claude/skills/dev/impl.md
---
provider: claude
model: sonnet
tools: [Read, Edit, Write, Bash]
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
| `model` | プロバイダのデフォルト | モデル名 |
| `tools` | 全許可 | ワーカーに許可するツール |
| `permission-mode` | `default` | ワーカーの権限モード |
| `inputs` | **必須** | 入力パラメータの宣言 |

### 入力型

| 型 | 説明 | Intent Gate |
|---|---|---|
| `plain` | ファイルパス、単純な値 | スキップ |
| `evidenced` | 要件、仕様。citation 必須 | 検証あり |

短縮形（`key: 説明文`）は `evidenced` として扱う。

## 構造化入力

### InputEntry

| 型 | フィールド | 説明 |
|---|---|---|
| `plain` | `value` | 単純な文字列値 |
| `evidenced` | `body`, `citations[]` | 本文と引用のリスト |

### Citation

| type | 付加情報 | 検証方法 |
|---|---|---|
| `transcript` | — | TRANSCRIPT_PATH のファイル内で excerpt を検索 |
| `uri` | `source` | テキストファイルなら内容で excerpt を検索、URL なら HEAD で到達確認 |
| `command` | `command` | 検証なし |

## ステップ間 I/O

### 出力の書き込み

ワーカーは `$GITHUB_OUTPUT` ファイルに出力を書き込む（GHA 互換）。

**plain 出力:**
```bash
echo "key=value" >> $GITHUB_OUTPUT
```

**evidenced 出力:**
```bash
key<<EOF
{"type":"evidenced","body":"要約","citations":[{"type":"uri","source":"ファイルパス","excerpt":"引用箇所"}]}
EOF
```

heredoc 内の JSON が evidenced 構造を持つ場合、自動検出して構造化データとして保持する。`key=value` 形式は常に plain として扱う。

### 出力の参照

`${{ steps.<id>.outputs.<key> }}` で前ステップの出力を参照する。

```yaml
inputs:
  changes: ${{ steps.impl.outputs.changes }}
```

**参照解決ルール:**
- **単一参照**（テンプレートが参照のみ）: evidenced 構造をそのまま伝搬
- **テキスト混在**（`"prefix ${{ ... }} suffix"`）: evidenced が含まれる場合は**エラー**。plain のみ許可
- **run ステップ内の参照**: evidenced の body を文字列として展開（シェルコマンドには構造化データ不要）

evidenced がテキスト混在で暗黙に消失することを防ぐための設計。

### outputs の逆算

スキルは outputs を明示的に宣言しない。ワークフロー全体の参照を走査し、後続ステップで使われるキーを逆算してワーカーのプロンプトに含める。

## Intent Gate

スキルステップ実行前に evidenced inputs の citation を検証する。

1. 各 evidenced input の citations を並列検証
2. excerpt が source に実在するかチェック
3. 失敗 → ステップを実行せずにエラー

### 対話的入力収集（Interactive Launcher）

人間が CLI から直接実行した場合（TTY かつ `CLAUDECODE` 環境変数なし）、ワークフローを直接実行せず、ビルトインの対話ワークフローをエントリポイントに注入する。

1. onegai が呼び出し元を判定（TTY + CLAUDECODE 未設定 → 人間）
2. 対話スキル（`interactive: true`）がワークフロー全体の required inputs を走査
3. 不足している inputs をユーザーとの対話で収集
4. 全 inputs が揃ったら、本来のワークフローを通常の agent モードで実行

これにより、ランタイムに human/agent の2つのモードを持つのではなく、**パイプラインの入口を差し替える**設計になる。CallerMode による入力型チェックのバイパスや Intent Gate のスキップは不要になり、全実行パスで evidenced の検証が一貫して行われる。

対話スキルはスキルフロントマターに `interactive: true` を宣言する。このフラグを持つスキルは、ワーカーがユーザーと直接対話できる。

## ワーカープロンプト

onegai がスキルステップ実行時に自動生成するプロンプトの構成:

1. **Inputs**: 各入力を plain/evidenced に応じてフォーマット（evidenced は citation 付き）
2. **Outputs**: 後続ステップで参照されるキーのリストと書き込み方法
3. **Context**: ワークフローファイルのパス
4. **Workflow**: スキル .md の本文
5. **Protocol**: 拒否時の作法（`reject_reason`）、plain/evidenced の出力フォーマット

ワーカーが inputs 不十分と判断した場合、`reject_reason` を出力してステップを失敗させる。

## 実行結果の永続化

実行結果は `.onegai/runs/<run-id>/run.json` に保存される。outputs は evidenced 構造もそのままシリアライズされる。

## メインエージェント連携

### ワークフロー一覧の注入

hook（UserPromptSubmit）が `onegai workflows --context` を呼び、各ワークフローの required inputs を自動計算してコンテキストに注入する。

required inputs = 全スキルの inputs の和集合 − ステップ間配線で供給される inputs
