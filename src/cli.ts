#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseWorkflowFile } from "./workflow-parser.js";
import { runWorkflow } from "./runner.js";
import { inspectWorkflow } from "./inspect.js";
import { resolveSkillsDirs, resolveWorkflowsDirs, findWorkflowFiles } from "./paths.js";
import type { InputEntry } from "./types.js";

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  printUsage();
  process.exit(0);
}

switch (command) {
  case "run":
    await handleRun(args.slice(1));
    break;
  case "inspect":
    handleInspect(args.slice(1));
    break;
  case "view":
    handleView(args.slice(1));
    break;
  case "workflows":
    handleWorkflows(args.slice(1));
    break;
  default:
    if (command.endsWith(".yml")) {
      await handleRun(args);
    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
}

async function handleRun(runArgs: string[]) {
  const workflowPath = runArgs[0];
  if (!workflowPath) {
    console.error("Usage: sidekick run <workflow.yml> [--input key=json]");
    process.exit(1);
  }

  const inputs: Record<string, InputEntry> = {};
  for (let i = 1; i < runArgs.length; i++) {
    if (runArgs[i] === "--input" && runArgs[i + 1]) {
      const eq = runArgs[i + 1].indexOf("=");
      if (eq > 0) {
        const key = runArgs[i + 1].slice(0, eq);
        const val = runArgs[i + 1].slice(eq + 1);
        try {
          inputs[key] = JSON.parse(val);
        } catch {
          inputs[key] = { type: "plain", value: val };
        }
      }
      i++;
    }
  }

  const cwd = process.cwd();
  const skillsDirs = resolveSkillsDirs(cwd);
  const runStoreDir = resolve(cwd, ".sidekick", "runs");

  const workflow = parseWorkflowFile(resolve(cwd, workflowPath));

  console.log(`[sidekick] Running workflow: ${workflow.name || workflowPath}`);

  const result = await runWorkflow(workflow, {
    cwd,
    skillsDirs,
    workflowFile: workflowPath,
    inputs,
    runStoreDir,
  });

  console.log(`[sidekick] Workflow ${result.status}: ${result.id}`);
  if (result.status === "failed") {
    process.exit(1);
  }
}

function handleInspect(inspectArgs: string[]) {
  const workflowPath = inspectArgs[0];
  if (!workflowPath) {
    console.error("Usage: sidekick inspect <workflow.yml>");
    process.exit(1);
  }

  const cwd = process.cwd();
  const skillsDirs = resolveSkillsDirs(cwd);
  const result = inspectWorkflow(resolve(cwd, workflowPath), skillsDirs);

  console.log(JSON.stringify(result, null, 2));
}

function handleView(viewArgs: string[]) {
  const runId = viewArgs[0];
  if (!runId) {
    console.error("Usage: sidekick view <run-id>");
    process.exit(1);
  }

  const runPath = join(process.cwd(), ".sidekick", "runs", runId, "run.json");
  if (!existsSync(runPath)) {
    console.error(`Run not found: ${runId}`);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(runPath, "utf-8"));
  const json = viewArgs.includes("--json");
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`Run: ${data.id}`);
    console.log(`Status: ${data.status}`);
    console.log(`Workflow: ${data.workflow}`);
    console.log(`Started: ${data.startedAt}`);
    if (data.finishedAt) console.log(`Finished: ${data.finishedAt}`);
    for (const [jobId, job] of Object.entries(data.jobs) as [string, { status: string; steps: { type: string; status: string; error?: string }[] }][]) {
      console.log(`\n  Job: ${jobId} (${job.status})`);
      for (const step of job.steps) {
        const marker = step.status === "done" ? "✓" : step.status === "failed" ? "✗" : "○";
        console.log(`    ${marker} ${step.type}${step.error ? `: ${step.error}` : ""}`);
      }
    }
  }
}

function handleWorkflows(wfArgs: string[]) {
  const cwd = process.cwd();
  const workflowDirs = resolveWorkflowsDirs(cwd);
  const files = findWorkflowFiles(workflowDirs);
  const isContext = wfArgs.includes("--context");

  if (files.length === 0) {
    if (!isContext) console.log("No workflows found.");
    return;
  }

  const skillsDirs = resolveSkillsDirs(cwd);

  const lines: string[] = [];
  for (const file of files) {
    try {
      const result = inspectWorkflow(file, skillsDirs);
      const inputs = result.requiredInputs
        .map((i) => `${i.key}[${i.type}]`)
        .join(", ");
      const inputSuffix = inputs ? ` (inputs: ${inputs})` : "";
      lines.push(`- ${file}: ${result.name}${inputSuffix}`);
    } catch {
      lines.push(`- ${file}: (parse error)`);
    }
  }

  if (isContext) {
    const context = `利用可能なワークフロー:\n${lines.join("\n")}`;
    console.log(JSON.stringify(context));
  } else {
    console.log("Workflows:\n" + lines.join("\n"));
  }
}

function printUsage() {
  console.log(`sidekick - Declarative workflow orchestrator for AI agents

Commands:
  run <workflow.yml> [--input key=json]   Run a workflow
  inspect <workflow.yml>                  Show required inputs as JSON
  workflows [--context]                        List available workflows
  view <run-id> [--json]                  View run results

Shorthand:
  sidekick <workflow.yml>                 Same as sidekick run`);
}
