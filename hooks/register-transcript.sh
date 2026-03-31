#!/bin/bash
# SessionStart hook — exports TRANSCRIPT_PATH for skill steps.

INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')

if [ -n "$TRANSCRIPT_PATH" ]; then
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"env\":{\"TRANSCRIPT_PATH\":\"$TRANSCRIPT_PATH\"}}}"
fi

exit 0
