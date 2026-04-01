---
tools: [Bash]
permission-mode: bypassPermissions
inputs:
  greeting:
    description: 大声にする挨拶文
    type: plain
---

受け取った greeting を大文字に変換して echo "result=..." で GITHUB_OUTPUT に書き込む。
