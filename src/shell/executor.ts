import { spawnSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { query, type PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import type { Step, SkillStep, StepResult, InputValue, Workflow, CallerMode } from "@core/types";
import { buildWorkerPrompt } from "@core/prompts";
import { runIntentGate } from "@core/intent-gate";
import { resolveOutputRefs, resolveOutputRefsTyped, extractOutputKeys, entryToString } from "@core/output-resolver";
import { loadSkill } from "@shell/skill-loader";
import { createDefaultVerifier } from "@shell/evidence-verifier";
import { parseGithubOutput } from "@shell/output-reader";
import { getOnegaiLogger } from "@shell/logger";

interface StepContext {
  cwd: string;
  skillsDirs: string[];
  workflowFile?: string;
  workflow: Workflow;
  stepOutputs: Record<string, Record<string, InputValue>>;
  inputs: Record<string, InputValue>;
  callerMode: CallerMode;
}

function tempOutputPath(cwd: string): string {
  return join(cwd, `.onegai_output_${nanoid(8)}`);
}

function cleanupFile(path: string) {
  try { unlinkSync(path); } catch { /* ignore */ }
}

function failedStep(step: Step, error: string, outputs: Record<string, InputValue> = {}): StepResult {
  return { id: step.id, type: step.type, status: "failed", outputs, error };
}

// oxlint-disable-next-line no-explicit-any -- SDK message is untyped
function logWorkerMessage(skill: string, message: any) {
  const log = getOnegaiLogger(skill);
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if (block.type === "text" && block.text) {
        log.info(block.text);
      } else if (block.type === "tool_use") {
        log.info(`tool: ${block.name}${block.input?.command ? ` — ${block.input.command}` : ""}`);
      }
    }
  } else if (message.type === "result") {
    if (message.is_error) {
      log.error(String(message.result));
    }
  }
}

function withOutputFile<T>(cwd: string, fn: (outputFile: string) => T): { result: T; outputs: Record<string, InputValue> } {
  const outputFile = tempOutputPath(cwd);
  const result = fn(outputFile);
  const outputs = parseGithubOutput(outputFile);
  cleanupFile(outputFile);
  return { result, outputs };
}

export async function executeStep(step: Step, ctx: StepContext): Promise<StepResult> {
  switch (step.type) {
    case "run":
      return executeRunStep(step, ctx);
    case "skill":
      return executeSkillStep(step, ctx);
  }
}

function executeRunStep(step: Step & { type: "run" }, ctx: StepContext): StepResult {
  const resolved = resolveOutputRefs(step.run, ctx.stepOutputs);
  const { result: spawnResult, outputs } = withOutputFile(ctx.cwd, (outputFile) =>
    spawnSync("sh", ["-c", resolved], {
      cwd: ctx.cwd,
      encoding: "utf-8",
      timeout: 300_000,
      env: { ...process.env, GITHUB_OUTPUT: outputFile },
    }),
  );

  if (spawnResult.status !== 0) {
    return failedStep(step, spawnResult.stderr || `exit ${spawnResult.status}`, outputs);
  }

  return { id: step.id, type: "run", status: "done", outputs };
}

async function executeSkillStep(step: SkillStep, ctx: StepContext): Promise<StepResult> {
  const skillResult = loadSkill(ctx.skillsDirs, step.skill);
  if (skillResult.isErr()) return failedStep(step, skillResult.error);
  const skill = skillResult.value;

  const resolvedInputs: Record<string, InputValue> = {};
  if (step.inputs) {
    for (const [key, val] of Object.entries(step.inputs)) {
      const resolved = resolveOutputRefsTyped(val, ctx.stepOutputs);
      if (resolved.isErr()) return failedStep(step, `${key}: ${resolved.error}`);
      resolvedInputs[key] = resolved.value;
    }
  }

  const mergedInputs = { ...ctx.inputs, ...resolvedInputs };

  const errors: string[] = [];
  for (const [key, spec] of Object.entries(skill.frontmatter.inputs)) {
    if (!(key in mergedInputs)) {
      errors.push(`missing: ${key}`);
      continue;
    }
    if (ctx.callerMode === "agent" && mergedInputs[key].type !== spec.type) {
      errors.push(`${key}: expected ${spec.type}, got ${mergedInputs[key].type}`);
    }
  }
  if (errors.length > 0) {
    return failedStep(step, `Invalid inputs: ${errors.join("; ")}`);
  }

  if (ctx.callerMode === "agent") {
    const gate = await runIntentGate(mergedInputs, createDefaultVerifier(), process.env.TRANSCRIPT_PATH);
    if (gate.isErr()) return failedStep(step, gate.error);
  }

  const requiredOutputs = step.id ? extractOutputKeys(ctx.workflow, step.id) : [];
  const prompt = buildWorkerPrompt(skill.body, mergedInputs, requiredOutputs, ctx.workflowFile);

  getOnegaiLogger().info(`Running skill: ${step.skill}`);

  const outputFile = tempOutputPath(ctx.cwd);

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: ctx.cwd,
        model: skill.frontmatter.model,
        allowedTools: skill.frontmatter.tools,
        permissionMode: (skill.frontmatter["permission-mode"] ?? "default") as PermissionMode,
        allowDangerouslySkipPermissions: true,
        maxTurns: 50,
        env: { ...process.env, GITHUB_OUTPUT: outputFile },
      },
    })) {
      logWorkerMessage(step.skill, message);
      if ("result" in message) {
        getOnegaiLogger().info(`Skill completed: ${step.skill}`);
      }
    }
  } catch (e) {
    cleanupFile(outputFile);
    return failedStep(step, (e as Error).message);
  }

  const outputs = parseGithubOutput(outputFile);
  cleanupFile(outputFile);

  const rejectEntry = outputs.reject_reason;
  if (rejectEntry) {
    return failedStep(step, `Rejected: ${entryToString(rejectEntry)}`, outputs);
  }

  return { id: step.id, type: "skill", status: "done", outputs };
}
