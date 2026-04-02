#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { InputValue, RunResult } from "@core/types";
import { loadWorkflowFile } from "@shell/workflow-loader";
import { runWorkflow } from "@shell/runner";
import { inspectWorkflow } from "@shell/inspect";
import { resolveSkillsDirs, resolveWorkflowsDirs, findWorkflowFiles, resolveWorkflow } from "@shell/paths";
import { detectCallerMode } from "@shell/env";
import { launchInteractive } from "@shell/interactive-launcher";
import { setupLogger, getOnegaiLogger } from "@shell/logger";

await setupLogger();

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
    await handleRun(args);
}

async function handleRun(runArgs: string[]) {
  const workflowArg = runArgs[0];
  if (!workflowArg) {
    console.error("Usage: onegai run <workflow> [--input key=json]");
    process.exit(1);
  }

  const inputs: Record<string, InputValue> = {};
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
  const runStoreDir = resolve(cwd, ".onegai", "runs");

  const workflowPath = resolveWorkflow(cwd, workflowArg);
  if (!workflowPath) {
    console.error(`Workflow not found: ${workflowArg}`);
    process.exit(1);
  }
  const callerMode = detectCallerMode();
  const hasInputs = Object.keys(inputs).length > 0;

  if (callerMode === "human" && !hasInputs) {
    getOnegaiLogger().info(`Interactive mode: collecting inputs for ${workflowArg}`);
    await launchInteractive({ workflowPath, cwd, skillsDirs, runStoreDir });
    return;
  }

  const workflowResult = loadWorkflowFile(workflowPath);
  if (workflowResult.isErr()) {
    console.error(workflowResult.error);
    process.exit(1);
  }
  const workflow = workflowResult.value;

  getOnegaiLogger().info(`Running workflow: ${workflow.name || workflowArg}`);

  const result = await runWorkflow(workflow, {
    cwd,
    skillsDirs,
    workflowFile: workflowPath,
    inputs,
    runStoreDir,
    callerMode,
  });

  getOnegaiLogger().info(`Workflow ${result.status}: ${result.id}`);
  if (result.status === "failed") {
    process.exit(1);
  }
}

function handleInspect(inspectArgs: string[]) {
  const workflowPath = inspectArgs[0];
  if (!workflowPath) {
    console.error("Usage: onegai inspect <workflow.yml>");
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
    console.error("Usage: onegai view <run-id>");
    process.exit(1);
  }

  const runPath = join(process.cwd(), ".onegai", "runs", runId, "run.json");
  let data: RunResult;
  try {
    data = JSON.parse(readFileSync(runPath, "utf-8"));
  } catch {
    console.error(`Run not found: ${runId}`);
    process.exit(1);
  }
  if (viewArgs.includes("--json")) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`Run: ${data.id}`);
    console.log(`Status: ${data.status}`);
    console.log(`Workflow: ${data.workflow}`);
    console.log(`Started: ${data.startedAt}`);
    if (data.finishedAt) console.log(`Finished: ${data.finishedAt}`);
    for (const [jobId, job] of Object.entries(data.jobs)) {
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
  console.log(`onegai - Declarative workflow orchestrator for AI agents

Commands:
  run <workflow.yml> [--input key=json]   Run a workflow
  inspect <workflow.yml>                  Show required inputs as JSON
  workflows [--context]                        List available workflows
  view <run-id> [--json]                  View run results

Shorthand:
  onegai <workflow.yml>                 Same as onegai run`);
}
