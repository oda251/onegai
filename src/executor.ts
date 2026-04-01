import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { query, type PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import type { Step, SkillStep, StepResult, InputEntry, Workflow, CallerMode } from "./types";
import { loadSkill } from "./skill-loader";
import { buildWorkerPrompt } from "./prompt-builder";
import { createDefaultVerifier, runIntentGate } from "./intent-gate";
import { resolveOutputRefs, resolveOutputRefsTyped, extractOutputKeys } from "./output-resolver";

interface StepContext {
  cwd: string;
  skillsDirs: string[];
  workflowFile?: string;
  workflow: Workflow;
  stepOutputs: Record<string, Record<string, InputEntry>>;
  inputs: Record<string, InputEntry>;
  callerMode: CallerMode;
}

function tempOutputPath(cwd: string): string {
  return join(cwd, `.onegai_output_${nanoid(8)}`);
}

function cleanupFile(path: string) {
  try { unlinkSync(path); } catch { /* ignore */ }
}

export function tryParseEvidenced(raw: string): InputEntry {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.type === "evidenced" && typeof parsed.body === "string" && Array.isArray(parsed.citations)) {
      return { type: "evidenced", body: parsed.body, citations: parsed.citations };
    }
  } catch { /* not JSON or not evidenced */ }
  return { type: "plain", value: raw };
}

function parseGithubOutput(outputFile: string): Record<string, InputEntry> {
  let content: string;
  try {
    content = readFileSync(outputFile, "utf-8");
  } catch {
    return {};
  }
  const outputs: Record<string, InputEntry> = {};

  const heredocPattern = /^(\w+)<<(\S+)\n([\s\S]*?)\n\2$/gm;
  let match;
  while ((match = heredocPattern.exec(content)) !== null) {
    outputs[match[1]] = tryParseEvidenced(match[3]);
  }

  for (const line of content.split("\n")) {
    if (line.includes("<<")) continue;
    const eq = line.indexOf("=");
    if (eq > 0) {
      const key = line.slice(0, eq);
      if (!(key in outputs)) outputs[key] = { type: "plain", value: line.slice(eq + 1) };
    }
  }

  return outputs;
}

function failedStep(step: Step, error: string, outputs: Record<string, InputEntry> = {}): StepResult {
  return { id: step.id, type: step.type, status: "failed", outputs, error };
}

// oxlint-disable-next-line no-explicit-any -- SDK message is untyped
function logWorkerMessage(skill: string, message: any) {
  const prefix = `[onegai:${skill}]`;
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if (block.type === "text" && block.text) {
        console.log(`${prefix} ${block.text}`);
      } else if (block.type === "tool_use") {
        console.log(`${prefix} tool: ${block.name}${block.input?.command ? ` — ${block.input.command}` : ""}`);
      }
    }
  } else if (message.type === "result") {
    if (message.is_error) {
      console.error(`${prefix} error: ${message.result}`);
    }
  }
}

function withOutputFile<T>(cwd: string, fn: (outputFile: string) => T): { result: T; outputs: Record<string, InputEntry> } {
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
  const skill = loadSkill(ctx.skillsDirs, step.skill);

  const resolvedInputs: Record<string, InputEntry> = {};
  if (step.inputs) {
    for (const [key, val] of Object.entries(step.inputs)) {
      const resolved = resolveOutputRefsTyped(val, ctx.stepOutputs);
      if (!resolved.ok) return failedStep(step, `${key}: ${resolved.error}`);
      resolvedInputs[key] = resolved.entry;
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

  console.log(`[onegai] Running skill: ${step.skill}`);

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
        console.log(`[onegai] Skill completed: ${step.skill}`);
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
    const reason = rejectEntry.type === "plain" ? rejectEntry.value : rejectEntry.body;
    return failedStep(step, `Rejected: ${reason}`, outputs);
  }

  return { id: step.id, type: "skill", status: "done", outputs };
}
