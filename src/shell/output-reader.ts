import { readFileSync } from "node:fs";
import type { InputValue } from "@core/types";
import { parseGithubOutputContent } from "@core/output-format";

export function parseGithubOutput(outputFile: string): Record<string, InputValue> {
  try {
    return parseGithubOutputContent(readFileSync(outputFile, "utf-8"));
  } catch {
    return {};
  }
}
