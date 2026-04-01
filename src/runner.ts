import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import type { Workflow, RunResult, JobResult, InputEntry } from "./types";
import { getParallelBatches } from "./dag";
import { executeStep } from "./executor";

interface RunOptions {
  cwd: string;
  skillsDirs: string[];
  workflowFile: string;
  inputs: Record<string, InputEntry>;
  runStoreDir: string;
}

export async function runWorkflow(workflow: Workflow, options: RunOptions): Promise<RunResult> {
  const runId = `run-${nanoid(8)}`;
  const batches = getParallelBatches(workflow);

  const result: RunResult = {
    id: runId,
    workflow: options.workflowFile,
    status: "running",
    jobs: {},
    startedAt: new Date().toISOString(),
  };

  const failedJobs = new Set<string>();
  const stepOutputs: Record<string, Record<string, string>> = {};

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

      console.log(`[onegai] Starting job: ${jobId}`);

      for (const step of job.steps) {
        const stepResult = await executeStep(step, {
          cwd: options.cwd,
          skillsDirs: options.skillsDirs,
          workflowFile: options.workflowFile,
          workflow,
          stepOutputs,
          inputs: options.inputs,
        });

        jobResult.steps.push(stepResult);

        // Store outputs keyed by step id
        if (stepResult.id && Object.keys(stepResult.outputs).length > 0) {
          stepOutputs[stepResult.id] = stepResult.outputs;
        }

        if (stepResult.status === "failed") {
          jobResult.status = "failed";
          failedJobs.add(jobId);
          console.error(`[onegai] Step failed in job ${jobId}: ${stepResult.error}`);
          break;
        }
      }

      if (jobResult.status === "running") {
        jobResult.status = "done";
        console.log(`[onegai] Job completed: ${jobId}`);
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
