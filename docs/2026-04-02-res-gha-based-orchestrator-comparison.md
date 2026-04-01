---
tags:
  - research
  - orchestrator
  - github-actions
  - comparison
  - onegai
---
# GHA ベース AI ワークフローオーケストレーター比較

depends-on:
- [ハーネスエンジニアリング競合調査](./2026-03-30-res-harness-engineering-landscape.md)

onegai は GHA ライクな YAML 構文（jobs/steps/needs）で AI エージェントのワークフローを定義し、ローカルの独自ランタイムで実行するオーケストレーターである。本稿では GHA をベースにした、または GHA と密接に統合された AI オーケストレーターとの比較を行う。

---

## 1. GitHub Agentic Workflows (gh-aw)

- URL: [https://github.com/github/gh-aw](https://github.com/github/gh-aw)
- Stars: 約 4.1k（[GitHub](https://github.com/github/gh-aw)）
- GitHub 公式の AI エージェントワークフロー機能。Markdown ファイルで自動化タスクを自然言語で記述し、`gh aw compile` で GHA YAML にコンパイルして実行する（[GitHub Blog](https://github.blog/ai-and-ml/automate-repository-tasks-with-github-agentic-workflows/)）
- Copilot / Claude / Codex をエージェントとして選択可能
- safe-outputs による書き込み制御、読み取り専用デフォルト権限、GitHub MCP Server 統合

### onegai との比較

| 観点 | gh-aw | onegai |
|---|---|---|
| 定義形式 | Markdown（自然言語）→ GHA YAML にコンパイル | YAML（GHA ライク構文）を直接解釈 |
| 実行環境 | GHA ランナー（GitHub インフラ必須） | ローカル独自ランタイム |
| DAG 解決 | GHA が担当 | 独自エンジン |
| スキル定義 | なし（自然言語プロンプト） | Markdown frontmatter で宣言的に定義 |
| 入力検証 | なし | Intent Gate（evidenced 入力の引用検証） |
| 主な用途 | リポジトリ運用自動化（issue トリアージ、PR レビュー等） | 汎用ワークフローオーケストレーション |
| プロバイダー | Copilot / Claude / Codex | Claude（Agent SDK） |

**要点**: gh-aw は GHA 上で動くため CI/CD との統合が自然だが、ローカル実行ができない。onegai はローカルで完結し、GHA に依存しない。gh-aw は自然言語 → YAML の「コンパイル」方式のため、生成される YAML の予測可能性に課題がある。onegai は YAML を直接書くため決定論的。

---

## 2. Docker cagent (docker-agent)

- URL: [https://github.com/docker/docker-agent](https://github.com/docker/docker-agent)
- Stars: 約 2k（[GitHub](https://github.com/docker/docker-agent)）
- Docker 製のオープンソース AI エージェントビルダー & ランタイム。YAML 1 ファイルでエージェントの振る舞い、ツール、ペルソナ、サブエージェントへの委譲ルールを定義する（[Docker Blog](https://www.docker.com/blog/introducing-docker-ai-agent-toolkit/)）（未検証）
- [docker/cagent-action](https://github.com/docker/cagent-action) で GHA 上でも実行可能
- マルチプロバイダー（OpenAI, Anthropic, Gemini, ローカル推論）、MCP 統合、Docker Hub 経由でエージェント配布

### onegai との比較

| 観点 | cagent | onegai |
|---|---|---|
| 定義形式 | YAML（1 エージェント = 1 ファイル） | YAML（ワークフロー全体を定義） |
| DAG 解決 | なし（エージェント単体の定義が主眼） | あり（jobs/needs で依存解決） |
| ステップ間データフロー | なし | `${{ steps.<id>.outputs.<key> }}` |
| GHA 統合 | cagent-action で GHA ステップとして実行可 | GHA に依存しない |
| 入力検証 | なし | Intent Gate |
| プロバイダー | マルチプロバイダー | Claude（Agent SDK） |

**要点**: cagent はエージェント単体の定義に強いが、複数エージェントの DAG オーケストレーションやステップ間のデータフローを持たない。onegai はワークフロー全体の構造定義と実行制御にフォーカスしている。

---

## 3. ComposioHQ Agent Orchestrator

- URL: [https://github.com/ComposioHQ/agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator)
- 並列コーディングエージェントのオーケストレーター。バックログを読んでタスク分解・並列化を AI が自律判断する（[GitHub](https://github.com/ComposioHQ/agent-orchestrator)）
- 各エージェントが独立の git worktree / ブランチ / PR を持つ
- エージェント非依存（Claude Code, Codex, Aider 対応）、ランタイム非依存（tmux, Docker）

### onegai との比較

| 観点 | Composio | onegai |
|---|---|---|
| タスク分解 | AI が自律判断 | 人間が YAML で宣言 |
| DAG 解決 | AI が動的に判断 | 決定論的（needs で静的定義） |
| 作業分離 | PR / ブランチ単位 | ステップ単位 |
| GHA 統合 | GitHub CI との深い統合 | GHA に依存しない |
| 入力検証 | なし | Intent Gate |
| 再現性 | AI 判断に依存（非決定的） | YAML 定義通り（決定的） |

**要点**: Composio はタスク分解自体を AI に委ねる「自律型」。onegai はワークフローを人間が定義する「宣言型」。再現性と予測可能性で onegai が優位、柔軟性で Composio が優位。

---

## 4. Orloj

- URL: [https://github.com/OrlojHQ/orloj](https://github.com/OrlojHQ/orloj)
- マルチエージェント AI システム向けオーケストレーションランタイム。YAML で宣言し `orlojctl apply` で適用する「Agent Infrastructure as Code」（[Hacker News](https://news.ycombinator.com/item?id=47526813)）
- パイプライン / 階層 / スワームループなど複数のオーケストレーショントポロジー
- AgentPolicy / AgentRole によるガバナンス
- 4 種のアイソレーション（direct, sandboxed, container, WASM）

### onegai との比較

| 観点 | Orloj | onegai |
|---|---|---|
| 定義形式 | YAML（K8s マニフェスト的） | YAML（GHA ライク） |
| DAG 解決 | あり | あり |
| ガバナンス | AgentPolicy / AgentRole で手厚い | Intent Gate で入力検証 |
| 実行環境 | 独自ランタイム（4種アイソレーション） | ローカル独自ランタイム |
| スキル定義 | YAML マニフェスト | Markdown frontmatter |
| プロバイダー | マルチプロバイダー | Claude（Agent SDK） |
| 思想 | インフラ寄り（K8s 的） | アプリケーション寄り（GHA 的） |

**要点**: 設計思想が最も近いツール。Orloj はインフラ運用者向けの K8s 的アプローチ、onegai は開発者向けの GHA 的アプローチという棲み分け。Orloj はガバナンスが手厚いが、onegai の Intent Gate（入力の根拠検証）のような仕組みは持たない。

---

## 5. 汎用フレームワーク（参考）

| ツール | 定義方式 | DAG | GHA 関係 | 入力検証 |
|---|---|---|---|---|
| [LangGraph](https://github.com/langchain-ai/langgraph) | Python/JS コード | あり | なし | なし |
| [CrewAI](https://github.com/crewaiinc/crewai) | YAML + Python | 限定的 | なし | なし |
| [Dagger](https://github.com/dagger/dagger) | Go/Python/Node.js コード | あり | GHA 上で実行可 | なし |
| [Ruflo](https://github.com/ruvnet/ruflo) | MCP ツール | なし | なし | なし |
| [Swarms](https://github.com/kyegomez/swarms) | YAML + Python | あり | なし | なし |

いずれもコードファーストであり、YAML のみでワークフロー定義が完結するツールは onegai と Orloj のみ。

---

## 総合比較

| 特性 | onegai | gh-aw | cagent | Composio | Orloj |
|---|---|---|---|---|---|
| 定義形式 | YAML (GHA ライク) | Markdown → GHA YAML | YAML (エージェント単位) | YAML + AI 自律 | YAML (K8s ライク) |
| DAG 依存解決 | あり | GHA が担当 | なし | AI が判断 | あり |
| ステップ間データフロー | `${{ steps.*.outputs.* }}` | GHA 標準 | なし | なし | あり（未検証） |
| 実行環境 | ローカル独自ランタイム | GHA ランナー | Docker / ローカル | tmux / Docker | 独自ランタイム |
| 入力検証 (Intent Gate) | **あり** | なし | なし | なし | なし |
| スキル定義 | Markdown frontmatter | なし | YAML 内 | なし | YAML マニフェスト |
| プロバイダー | Claude (Agent SDK) | Copilot/Claude/Codex | マルチ | マルチ | マルチ |
| ローカル実行 | あり | なし | あり | あり | あり |

---

## onegai の差別化ポイント

### 1. Intent Gate（入力の根拠検証）

スキルの frontmatter で入力に `evidenced` 型を宣言すると、実行前に引用（source + excerpt）の存在を検証する。調査した全ツールにこの仕組みはない。

他ツールのガバナンスとの違い:
- Orloj の AgentPolicy → 権限制御（何をしてよいか）であり、入力の根拠検証ではない
- CrewAI の expected_output → 出力側のバリデーションであり、入力の幻覚抑制ではない
- Guardrails AI → 単一 LLM 呼び出しの出力品質であり、エージェント間のエビデンス伝播ではない

### 2. GHA ライク YAML × ローカルランタイム

GHA の jobs/steps/needs 構文を知っていればそのまま書ける親しみやすさと、GHA インフラに依存しないローカル実行を両立している。gh-aw は GHA ランナー必須、Orloj は K8s 的な独自構文で学習コストが高い。

### 3. Markdown frontmatter によるスキル定義

スキルを Markdown ファイルで宣言的に定義し、frontmatter で inputs / tools / provider を指定する。コード変更なしにファイル追加だけでスキルとワークフローを拡張できる。
