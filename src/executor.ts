import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Step, SkillStep, StepResult, InputEntry, Workflow } from "./types.js";
import { loadSkill } from "./skill-loader.js";
import { buildWorkerPrompt } from "./prompt-builder.js";
import { createDefaultVerifier, runIntentGate } from "./intent-gate.js";
import { resolveOutputRefs, extractRequiredOutputKeys } from "./output-resolver.js";

interface StepContext {
  cwd: string;
  skillsDirs: string[];
  workflowFile?: string;
  workflow: Workflow;
  stepOutputs: Record<string, Record<string, string>>;
  inputs: Record<string, InputEntry>;
}

export async function executeStep(step: Step, ctx: StepContext): Promise<StepResult> {
  switch (step.type) {
    case "run":
      return executeRunStep(step, ctx);
    case "skill":
      return executeSkillStep(step, ctx);
  }
}

function parseGithubOutput(outputFile: string): Record<string, string> {
  if (!existsSync(outputFile)) return {};
  const content = readFileSync(outputFile, "utf-8");
  const outputs: Record<string, string> = {};

  // Parse heredoc format: key<<delimiter\nvalue\ndelimiter
  const heredocPattern = /^(\w+)<<(\S+)\n([\s\S]*?)\n\2$/gm;
  let match;
  while ((match = heredocPattern.exec(content)) !== null) {
    outputs[match[1]] = match[3];
  }

  // Parse simple format: key=value
  for (const line of content.split("\n")) {
    if (line.includes("<<")) continue;
    const eq = line.indexOf("=");
    if (eq > 0) {
      const key = line.slice(0, eq);
      if (!(key in outputs)) {
        outputs[key] = line.slice(eq + 1);
      }
    }
  }

  return outputs;
}

function executeRunStep(step: { run: string; id?: string }, ctx: StepContext): StepResult {
  const resolved = resolveOutputRefs(step.run, ctx.stepOutputs);
  const outputFile = join(ctx.cwd, `.sidekick_output_${Date.now()}`);

  const result = spawnSync("sh", ["-c", resolved], {
    cwd: ctx.cwd,
    encoding: "utf-8",
    timeout: 300_000,
    env: { ...process.env, GITHUB_OUTPUT: outputFile },
  });

  const outputs = parseGithubOutput(outputFile);
  try { spawnSync("rm", ["-f", outputFile]); } catch { /* ignore */ }

  if (result.status !== 0) {
    return {
      id: step.id,
      type: "run",
      status: "failed",
      outputs,
      error: result.stderr || `exit ${result.status}`,
    };
  }

  return { id: step.id, type: "run", status: "done", outputs };
}

async function executeSkillStep(step: SkillStep, ctx: StepContext): Promise<StepResult> {
  const skill = loadSkill(ctx.skillsDirs, step.skill);

  // Resolve input references from previous step outputs
  const resolvedInputs: Record<string, InputEntry> = {};
  if (step.inputs) {
    for (const [key, val] of Object.entries(step.inputs)) {
      const resolved = resolveOutputRefs(val, ctx.stepOutputs);
      resolvedInputs[key] = { type: "plain", value: resolved };
    }
  }

  // Merge with workflow-level inputs (for entry steps)
  const mergedInputs = { ...ctx.inputs, ...resolvedInputs };

  // Validate inputs against skill declaration
  const errors: string[] = [];
  for (const [key, spec] of Object.entries(skill.frontmatter.inputs)) {
    if (!(key in mergedInputs)) {
      errors.push(`missing: ${key}`);
      continue;
    }
    if (mergedInputs[key].type !== spec.type) {
      errors.push(`${key}: expected ${spec.type}, got ${mergedInputs[key].type}`);
    }
  }
  if (errors.length > 0) {
    return {
      id: step.id,
      type: "skill",
      status: "failed",
      outputs: {},
      error: `Invalid inputs: ${errors.join("; ")}`,
    };
  }

  // Intent Gate
  const verifier = createDefaultVerifier();
  const gate = await runIntentGate(mergedInputs, verifier, process.env.TRANSCRIPT_PATH);
  if (gate.isErr()) {
    return {
      id: step.id,
      type: "skill",
      status: "failed",
      outputs: {},
      error: gate.error,
    };
  }

  // Determine required outputs from workflow wiring
  const requiredOutputs = step.id
    ? extractRequiredOutputKeys(ctx.workflow, step.id)
    : [];

  const prompt = buildWorkerPrompt(
    skill.body,
    mergedInputs,
    requiredOutputs,
    ctx.workflowFile,
  );

  console.log(`[sidekick] Running skill: ${step.skill}`);

  // Execute via Agent SDK
  const outputFile = join(ctx.cwd, `.sidekick_output_${Date.now()}`);

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: ctx.cwd,
        model: skill.frontmatter.model,
        allowedTools: skill.frontmatter.tools,
        permissionMode: (skill.frontmatter["permission-mode"] ?? "auto") as "auto",
        allowDangerouslySkipPermissions: true,
        maxTurns: 50,
        env: { GITHUB_OUTPUT: outputFile },
      },
    })) {
      if ("result" in message) {
        console.log(`[sidekick] Skill completed: ${step.skill}`);
      }
    }
  } catch (e) {
    return {
      id: step.id,
      type: "skill",
      status: "failed",
      outputs: {},
      error: (e as Error).message,
    };
  }

  const outputs = parseGithubOutput(outputFile);
  try { spawnSync("rm", ["-f", outputFile]); } catch { /* ignore */ }

  if (outputs.reject_reason) {
    return {
      id: step.id,
      type: "skill",
      status: "failed",
      outputs,
      error: `Rejected: ${outputs.reject_reason}`,
    };
  }

  return { id: step.id, type: "skill", status: "done", outputs };
}
