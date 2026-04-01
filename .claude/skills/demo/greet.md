---
tools: [Bash]
permission-mode: bypassPermissions
inputs:
  name:
    description: 挨拶する相手の名前
    type: plain
---

echo "name=$INPUT_NAME" で GITHUB_OUTPUT に名前を書き込み、
echo "greeting=Hello, $INPUT_NAME!" で挨拶を GITHUB_OUTPUT に書き込む。
