import { parseWorkflowFile } from "./workflow-parser.js";
import { loadSkill } from "./skill-loader.js";
import type { InputSpec, Workflow } from "./types.js";

interface InspectResult {
  name: string;
  path: string;
  requiredInputs: { key: string; type: string; description: string }[];
}

export function inspectWorkflow(workflowPath: string, skillsDir: string): InspectResult {
  const workflow = parseWorkflowFile(workflowPath);

  // Collect all skill inputs
  const allInputs: Record<string, InputSpec> = {};
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps) {
      if (step.type !== "skill") continue;
      try {
        const skill = loadSkill(skillsDir, step.skill);
        for (const [key, spec] of Object.entries(skill.frontmatter.inputs)) {
          if (!(key in allInputs)) allInputs[key] = spec;
        }
      } catch {
        // Skill not found — skip
      }
    }
  }

  // Find inputs supplied by step output references
  const supplied = extractSuppliedKeys(workflow);

  // Required = all - supplied
  const requiredInputs = Object.entries(allInputs)
    .filter(([key]) => !supplied.has(key))
    .map(([key, spec]) => ({ key, type: spec.type, description: spec.description }));

  return { name: workflow.name, path: workflowPath, requiredInputs };
}

function extractSuppliedKeys(workflow: Workflow): Set<string> {
  const keys = new Set<string>();
  const pattern = /\$\{\{\s*steps\.\w+\.outputs\.(\w+)\s*\}\}/g;

  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps) {
      if (step.type !== "skill" || !step.inputs) continue;
      for (const val of Object.values(step.inputs)) {
        let match;
        while ((match = pattern.exec(val)) !== null) {
          keys.add(match[1]);
        }
        pattern.lastIndex = 0;
      }
    }
  }

  return keys;
}
