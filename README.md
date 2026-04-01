# onegai

Declarative workflow orchestrator for AI agents.

## What it does

onegai runs workflows that combine AI agent skills with shell commands. Workflows are YAML files defining jobs and steps with DAG-based dependency resolution.

```yaml
# .claude/workflows/dev/implement.yml
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

Skills are Markdown files with frontmatter declaring inputs, provider, and tools:

```yaml
# .claude/skills/dev/impl.md
---
provider: claude
model: sonnet
tools: [Read, Edit, Write, Bash]
inputs:
  what: 実装内容
  where:
    description: 対象ファイル
    type: plain
---

指定されたファイルに対して実装を行う。
```

## Core values

- **Hallucination suppression**: Evidenced inputs require citations. onegai verifies citations exist before execution (Intent Gate).
- **Progressive disclosure**: Workers receive only what they need. Process isolation prevents context leakage.
- **Declarative workflows**: Jobs, steps, and dependencies defined in YAML. No code changes to add workflows.

## Prerequisites

- [Claude Code](https://claude.ai/code) CLI installed and authenticated
- Node.js >= 20

## Install

```bash
npm install -g @onegai/cli
```

For development:

```bash
bun install
```

## CLI

```bash
onegai run <workflow.yml> [--input key=json]   # Run a workflow
onegai workflows [--context]                   # List available workflows
onegai inspect <workflow.yml>                  # Show required inputs as JSON
onegai view <run-id> [--json]                  # View run results
```

## How it works

1. `onegai workflows` shows available workflows with their required inputs
2. `onegai run` validates inputs (Intent Gate), resolves the DAG, executes jobs in parallel batches
3. `skill:` steps run via Claude Agent SDK with process isolation
4. `run:` steps execute shell commands
5. Step outputs flow via `${{ steps.<id>.outputs.<key> }}` references
6. Results are persisted in `.onegai/runs/`

## File structure

```
.claude/
  workflows/       # Workflow definitions (.yml)
  skills/          # Skill definitions (.md)
  hooks/           # Claude Code hooks
```

Skills are resolved from: project `.claude/skills/`, repo root, `~/.claude/skills/`.

## Design docs

- [Design Philosophy](./docs/2026-03-30-dec-onegai-design-philosophy.md)
- [v2 Specification](./docs/2026-03-31-dec-onegai-v2-spec.md)
- [Jobs/Steps Architecture](./docs/2026-03-31-con-jobs-steps-architecture.md)
