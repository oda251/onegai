import { readFileSync } from "node:fs";
import { err, type Result } from "neverthrow";
import type { Workflow } from "@core/types";
import { parseWorkflow } from "@core/workflow-schema";

export function loadWorkflowFile(path: string): Result<Workflow, string> {
  try {
    return parseWorkflow(readFileSync(path, "utf-8"));
  } catch (e) {
    return err(`Cannot read workflow: ${path} — ${(e as Error).message}`);
  }
}
