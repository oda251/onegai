import { ok, err, type Result } from "neverthrow";
import type { InputValue, Workflow } from "@core/types";

const OUTPUT_REF = /\$\{\{\s*steps\.(\w+)\.outputs\.(\w+)\s*\}\}/g;
const SINGLE_REF = /^\$\{\{\s*steps\.(\w+)\.outputs\.(\w+)\s*\}\}$/;

export function entryToString(entry: InputValue): string {
  return entry.type === "plain" ? entry.value : entry.body;
}

export function resolveOutputRefs(
  template: string,
  stepOutputs: Record<string, Record<string, InputValue>>,
): string {
  return template.replace(
    OUTPUT_REF,
    (_, stepId, key) => {
      const entry = stepOutputs[stepId]?.[key];
      return entry ? entryToString(entry) : "";
    },
  );
}

export function resolveOutputRefsTyped(
  template: string,
  stepOutputs: Record<string, Record<string, InputValue>>,
): Result<InputValue, string> {
  const single = SINGLE_REF.exec(template);
  if (single) {
    const entry = stepOutputs[single[1]]?.[single[2]];
    return ok(entry ?? { type: "plain", value: "" });
  }

  let hasEvidenced = false;
  const resolved = template.replace(
    OUTPUT_REF,
    (_, stepId, key) => {
      const entry = stepOutputs[stepId]?.[key];
      if (entry?.type === "evidenced") hasEvidenced = true;
      return entry ? entryToString(entry) : "";
    },
  );
  if (hasEvidenced) {
    return err("evidenced output cannot be mixed with text; use a single reference");
  }
  return ok({ type: "plain" as const, value: resolved });
}

export function extractOutputKeys(
  workflow: Workflow,
  stepId?: string,
): string[] {
  const keys = new Set<string>();
  const pattern = stepId
    ? `\\$\\{\\{\\s*steps\\.${stepId}\\.outputs\\.(\\w+)\\s*\\}\\}`
    : "\\$\\{\\{\\s*steps\\.\\w+\\.outputs\\.(\\w+)\\s*\\}\\}";
  const re = new RegExp(pattern, "g");

  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps) {
      if (step.type !== "skill" || !step.inputs) continue;
      for (const val of Object.values(step.inputs)) {
        for (const match of val.matchAll(re)) {
          keys.add(match[1]);
        }
      }
    }
  }

  return [...keys];
}
