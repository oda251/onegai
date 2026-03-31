#!/bin/bash
# UserPromptSubmit hook — injects available workflows into main agent context.

CONTEXT=$(sidekick list --context 2>/dev/null)

if [ -n "$CONTEXT" ]; then
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"UserPromptSubmit\",\"additionalContext\":$CONTEXT}}"
fi

exit 0
