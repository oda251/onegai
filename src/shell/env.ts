import type { CallerMode } from "@core/types";

export function detectCallerMode(): CallerMode {
  if (!process.stdin.isTTY || !!process.env.CLAUDECODE) return "agent";
  return "human";
}
