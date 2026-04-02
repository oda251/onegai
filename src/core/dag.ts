import { ok, err, type Result } from "neverthrow";
import type { Workflow } from "@core/types";

export function getParallelBatches(workflow: Workflow): Result<string[][], string> {
  const jobs = workflow.jobs;
  const jobIds = Object.keys(jobs);
  const jobCount = jobIds.length;

  for (const [id, job] of Object.entries(jobs)) {
    for (const dep of job.needs) {
      if (!(dep in jobs)) return err(`Job "${id}" depends on unknown job "${dep}"`);
    }
  }

  const done = new Set<string>();
  const batches: string[][] = [];

  while (done.size < jobCount) {
    const batch: string[] = [];
    for (const id of jobIds) {
      if (done.has(id)) continue;
      if (jobs[id].needs.every((dep) => done.has(dep))) {
        batch.push(id);
      }
    }
    if (batch.length === 0) return err("Circular dependency detected in jobs");
    for (const id of batch) done.add(id);
    batches.push(batch);
  }

  return ok(batches);
}
