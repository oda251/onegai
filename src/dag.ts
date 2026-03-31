import type { Workflow } from "./types";

export function getParallelBatches(workflow: Workflow): string[][] {
  const jobs = workflow.jobs;
  const jobIds = Object.keys(jobs);
  const jobCount = jobIds.length;

  // Validate dependencies
  for (const [id, job] of Object.entries(jobs)) {
    for (const dep of job.needs) {
      if (!(dep in jobs)) throw new Error(`Job "${id}" depends on unknown job "${dep}"`);
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
    if (batch.length === 0) throw new Error("Circular dependency detected in jobs");
    for (const id of batch) done.add(id);
    batches.push(batch);
  }

  return batches;
}
