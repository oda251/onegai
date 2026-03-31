import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import * as v from "valibot";
import type { Workflow, Job, Step, SkillStep, RunStep } from "./types";

const SkillStepSchema = v.object({
  skill: v.string(),
  id: v.optional(v.string()),
  inputs: v.optional(v.record(v.string(), v.string())),
});

const RunStepSchema = v.object({
  run: v.string(),
  id: v.optional(v.string()),
});

const StepSchema = v.union([SkillStepSchema, RunStepSchema]);

const JobSchema = v.object({
  needs: v.optional(v.union([v.string(), v.array(v.string())])),
  steps: v.array(StepSchema),
});

const WorkflowSchema = v.object({
  name: v.optional(v.string()),
  jobs: v.record(v.string(), JobSchema),
});

function normalizeStep(raw: v.InferOutput<typeof StepSchema>): Step {
  if ("skill" in raw) {
    const step: SkillStep = { type: "skill", skill: raw.skill };
    if (raw.id) step.id = raw.id;
    if (raw.inputs) step.inputs = raw.inputs;
    return step;
  }
  const step: RunStep = { type: "run", run: raw.run };
  if (raw.id) step.id = raw.id;
  return step;
}

export function parseWorkflow(raw: string): Workflow {
  const doc = parseYaml(raw);
  const parsed = v.parse(WorkflowSchema, doc);

  const jobs: Record<string, Job> = {};
  for (const [id, jobRaw] of Object.entries(parsed.jobs)) {
    const needs = jobRaw.needs
      ? Array.isArray(jobRaw.needs) ? jobRaw.needs : [jobRaw.needs]
      : [];
    jobs[id] = {
      id,
      needs,
      steps: jobRaw.steps.map(normalizeStep),
    };
  }

  return { name: parsed.name ?? "", jobs };
}

export function parseWorkflowFile(path: string): Workflow {
  return parseWorkflow(readFileSync(path, "utf-8"));
}
