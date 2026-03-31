import { parseWorkflowFile } from "./workflow-parser.js";
import { loadSkill } from "./skill-loader.js";
import { extractOutputKeys } from "./output-resolver.js";
import type { InputSpec } from "./types.js";

interface InspectResult {
  name: string;
  path: string;
  requiredInputs: { key: string; type: string; description: string }[];
}

export function inspectWorkflow(workflowPath: string, skillsDirs: string[]): InspectResult {
  const workflow = parseWorkflowFile(workflowPath);

  const allInputs: Record<string, InputSpec> = {};
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps) {
      if (step.type !== "skill") continue;
      try {
        const skill = loadSkill(skillsDirs, step.skill);
        for (const [key, spec] of Object.entries(skill.frontmatter.inputs)) {
          if (!(key in allInputs)) allInputs[key] = spec;
        }
      } catch {
        // Skill not found — skip
      }
    }
  }

  const supplied = new Set(extractOutputKeys(workflow));

  const requiredInputs = Object.entries(allInputs)
    .filter(([key]) => !supplied.has(key))
    .map(([key, spec]) => ({ key, type: spec.type, description: spec.description }));

  return { name: workflow.name, path: workflowPath, requiredInputs };
}
