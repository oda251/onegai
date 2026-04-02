import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// --- Temp directory lifecycle ---

export interface TestDir {
  root: string;
  skillsDir: string;
  workflowsDir: string;
  runStoreDir: string;
  cleanup: () => void;
}

export function createTestDir(name: string): TestDir {
  const root = mkdtempSync(join(tmpdir(), `onegai-${name}-`));
  const skillsDir = join(root, "skills");
  const workflowsDir = join(root, "workflows");
  const runStoreDir = join(root, "runs");
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(workflowsDir, { recursive: true });
  mkdirSync(runStoreDir, { recursive: true });
  return {
    root,
    skillsDir,
    workflowsDir,
    runStoreDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

// --- Skill factory ---

interface SkillOptions {
  inputs?: Record<string, string | { description: string; type: "plain" | "evidenced" }>;
  model?: string;
  tools?: string[];
  permissionMode?: string;
  interactive?: boolean;
  body?: string;
}

export function createSkill(dir: string, name: string, opts: SkillOptions = {}) {
  const {
    inputs = { what: "Details" },
    model,
    tools,
    permissionMode,
    interactive,
    body = "Do the work.",
  } = opts;

  const inputLines = Object.entries(inputs).map(([key, val]) => {
    if (typeof val === "string") return `  ${key}: "${val}"`;
    return `  ${key}:\n    description: "${val.description}"\n    type: ${val.type}`;
  });

  const lines = ["---"];
  if (model) lines.push(`model: ${model}`);
  if (tools) lines.push(`tools: [${tools.join(", ")}]`);
  if (permissionMode) lines.push(`permission-mode: ${permissionMode}`);
  if (interactive) lines.push("interactive: true");
  lines.push("inputs:");
  lines.push(...inputLines);
  lines.push("---");
  lines.push("");
  lines.push(body);

  const fullPath = join(dir, `${name}.md`);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, lines.join("\n"));
}

// --- Workflow factory ---

interface WorkflowStep {
  skill?: string;
  run?: string;
  id?: string;
  inputs?: Record<string, string>;
}

interface WorkflowJob {
  needs?: string[];
  steps: WorkflowStep[];
}

interface WorkflowOptions {
  name?: string;
  jobs: Record<string, WorkflowJob>;
}

export function createWorkflow(dir: string, relPath: string, opts: WorkflowOptions) {
  const { name = "Test", jobs } = opts;

  const lines = [`name: ${name}`, "", "jobs:"];
  for (const [jobId, job] of Object.entries(jobs)) {
    lines.push(`  ${jobId}:`);
    if (job.needs?.length) lines.push(`    needs: [${job.needs.join(", ")}]`);
    lines.push("    steps:");
    for (const step of job.steps) {
      if (step.skill) {
        lines.push(`      - skill: ${step.skill}`);
        if (step.id) lines.push(`        id: ${step.id}`);
        if (step.inputs) {
          lines.push("        inputs:");
          for (const [k, v] of Object.entries(step.inputs)) {
            const needsQuote = v.includes("${{") || v.includes(":") || v.includes("#");
            lines.push(`          ${k}: ${needsQuote ? `"${v}"` : v}`);
          }
        }
      } else if (step.run) {
        lines.push(`      - run: ${step.run}`);
        if (step.id) lines.push(`        id: ${step.id}`);
      }
    }
  }

  const fullPath = join(dir, relPath.endsWith(".yml") ? relPath : `${relPath}.yml`);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, lines.join("\n") + "\n");
  return fullPath;
}

// --- SDK mock ---

export type MockBehavior = (prompt: string, env: Record<string, string>) => void;

export function createSdkMock(getBehavior: () => MockBehavior) {
  return {
    query: ({ prompt, options }: { prompt: string; options: { env?: Record<string, string>; allowedTools?: string[] } }) => {
      getBehavior()(prompt, options.env ?? {});
      return {
        async *[Symbol.asyncIterator]() {
          yield { type: "result", result: "done" };
        },
      };
    },
  };
}
