import type { InputDefinition } from "@core/types";
import { extractOutputKeys } from "@core/output-resolver";
import { loadWorkflowFile } from "@shell/workflow-loader";
import { loadSkill } from "@shell/skill-loader";

interface InspectResult {
  name: string;
  path: string;
  requiredInputs: { key: string; type: string; description: string }[];
}

export function inspectWorkflow(workflowPath: string, skillsDirs: string[]): InspectResult {
  const workflowResult = loadWorkflowFile(workflowPath);
  if (workflowResult.isErr()) return { name: "", path: workflowPath, requiredInputs: [] };
  const workflow = workflowResult.value;

  const allInputs: Record<string, InputDefinition> = {};
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps) {
      if (step.type !== "skill") continue;
      const skillResult = loadSkill(skillsDirs, step.skill);
      if (skillResult.isOk()) {
        for (const [key, spec] of Object.entries(skillResult.value.frontmatter.inputs)) {
          if (!(key in allInputs)) allInputs[key] = spec;
        }
      }
    }
  }

  const supplied = new Set(extractOutputKeys(workflow));

  const requiredInputs = Object.entries(allInputs)
    .filter(([key]) => !supplied.has(key))
    .map(([key, spec]) => ({ key, type: spec.type, description: spec.description }));

  return { name: workflow.name, path: workflowPath, requiredInputs };
}
