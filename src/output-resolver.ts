import type { InputEntry } from "./types";

const OUTPUT_REF = /\$\{\{\s*steps\.(\w+)\.outputs\.(\w+)\s*\}\}/g;
const SINGLE_REF = /^\$\{\{\s*steps\.(\w+)\.outputs\.(\w+)\s*\}\}$/;

function entryToString(entry: InputEntry): string {
  return entry.type === "plain" ? entry.value : entry.body;
}

export function resolveOutputRefs(
  template: string,
  stepOutputs: Record<string, Record<string, InputEntry>>,
): string {
  return template.replace(
    OUTPUT_REF,
    (_, stepId, key) => {
      const entry = stepOutputs[stepId]?.[key];
      return entry ? entryToString(entry) : "";
    },
  );
}

export type ResolveResult =
  | { ok: true; entry: InputEntry }
  | { ok: false; error: string };

export function resolveOutputRefsTyped(
  template: string,
  stepOutputs: Record<string, Record<string, InputEntry>>,
): ResolveResult {
  const single = SINGLE_REF.exec(template);
  if (single) {
    const entry = stepOutputs[single[1]]?.[single[2]];
    return { ok: true, entry: entry ?? { type: "plain", value: "" } };
  }

  // Check if any referenced output is evidenced — mixing text with evidenced is not allowed
  let hasEvidenced = false;
  template.replace(OUTPUT_REF, (_, stepId, key) => {
    const entry = stepOutputs[stepId]?.[key];
    if (entry?.type === "evidenced") hasEvidenced = true;
    return "";
  });
  if (hasEvidenced) {
    return { ok: false, error: "evidenced output cannot be mixed with text; use a single reference" };
  }

  const resolved = template.replace(
    OUTPUT_REF,
    (_, stepId, key) => {
      const entry = stepOutputs[stepId]?.[key];
      return entry ? entryToString(entry) : "";
    },
  );
  return { ok: true, entry: { type: "plain", value: resolved } };
}

export function extractOutputKeys(
  workflow: { jobs: Record<string, { steps: { id?: string; inputs?: Record<string, string> }[] }> },
  stepId?: string,
): string[] {
  const keys = new Set<string>();
  const pattern = stepId
    ? new RegExp(`\\$\\{\\{\\s*steps\\.${stepId}\\.outputs\\.(\\w+)\\s*\\}\\}`, "g")
    : /\$\{\{\s*steps\.\w+\.outputs\.(\w+)\s*\}\}/g;

  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps) {
      if (!step.inputs) continue;
      for (const val of Object.values(step.inputs)) {
        let match;
        while ((match = pattern.exec(val)) !== null) {
          keys.add(match[1]);
        }
        pattern.lastIndex = 0;
      }
    }
  }

  return [...keys];
}
