---
provider: claude
model: sonnet
tools: [Read, Glob, Grep]
inputs:
  changes: レビュー対象の変更内容
---

変更内容をレビューし、問題があれば指摘する。
