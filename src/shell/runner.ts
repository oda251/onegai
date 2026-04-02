import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import type { Workflow, RunResult, JobResult, CallerMode, InputValue } from "@core/types";
import { getParallelBatches } from "@core/dag";
import { executeStep } from "@shell/executor";
import { getOnegaiLogger } from "@shell/logger";

interface RunOptions {
  cwd: string;
  skillsDirs: string[];
  workflowFile: string;
  inputs: Record<string, InputValue>;
  runStoreDir: string;
  callerMode: CallerMode;
}

export async function runWorkflow(workflow: Workflow, options: RunOptions): Promise<RunResult> {
  const log = getOnegaiLogger();
  const runId = `run-${nanoid(8)}`;
  const batchesResult = getParallelBatches(workflow);
  if (batchesResult.isErr()) {
    return {
      id: runId,
      workflow: options.workflowFile,
      status: "failed",
      jobs: {},
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
  }
  const batches = batchesResult.value;

  const result: RunResult = {
    id: runId,
    workflow: options.workflowFile,
    status: "running",
    jobs: {},
    startedAt: new Date().toISOString(),
  };

  const failedJobs = new Set<string>();
  const stepOutputs: Record<string, Record<string, InputValue>> = {};

  for (const batch of batches) {
    const jobPromises = batch.map(async (jobId) => {
      const job = workflow.jobs[jobId];

      // Skip if any dependency failed
      if (job.needs.some((dep) => failedJobs.has(dep))) {
        result.jobs[jobId] = {
          id: jobId,
          status: "skipped",
          steps: [],
        };
        return;
      }

      const jobResult: JobResult = { id: jobId, status: "running", steps: [] };
      result.jobs[jobId] = jobResult;

      log.info(`Starting job: ${jobId}`);

      for (const step of job.steps) {
        const stepResult = await executeStep(step, {
          cwd: options.cwd,
          skillsDirs: options.skillsDirs,
          workflowFile: options.workflowFile,
          workflow,
          stepOutputs,
          inputs: options.inputs,
          callerMode: options.callerMode,
        });

        jobResult.steps.push(stepResult);

        if (stepResult.id && Object.keys(stepResult.outputs).length > 0) {
          stepOutputs[stepResult.id] = stepResult.outputs;
        }

        if (stepResult.status === "failed") {
          jobResult.status = "failed";
          failedJobs.add(jobId);
          log.error(`Step failed in job ${jobId}: ${stepResult.error}`);
          break;
        }
      }

      if (jobResult.status === "running") {
        jobResult.status = "done";
        log.info(`Job completed: ${jobId}`);
      }
    });

    await Promise.all(jobPromises);
  }

  result.status = failedJobs.size > 0 ? "failed" : "done";
  result.finishedAt = new Date().toISOString();

  // Persist run result
  saveRun(result, options.runStoreDir);

  return result;
}

function saveRun(result: RunResult, runStoreDir: string) {
  const runDir = join(runStoreDir, result.id);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "run.json"), JSON.stringify(result, null, 2));
}
