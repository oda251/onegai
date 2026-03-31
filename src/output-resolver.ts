export function resolveOutputRefs(
  template: string,
  stepOutputs: Record<string, Record<string, string>>,
): string {
  return template.replace(
    /\$\{\{\s*steps\.(\w+)\.outputs\.(\w+)\s*\}\}/g,
    (_, stepId, key) => stepOutputs[stepId]?.[key] ?? "",
  );
}

export function extractRequiredOutputKeys(
  workflow: { jobs: Record<string, { steps: { id?: string; inputs?: Record<string, string> }[] }> },
  stepId: string,
): string[] {
  const keys = new Set<string>();
  const pattern = new RegExp(`\\$\\{\\{\\s*steps\\.${stepId}\\.outputs\\.(\\w+)\\s*\\}\\}`, "g");

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
