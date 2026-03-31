import type { Workflow } from "./types.js";

export function topologicalSort(workflow: Workflow): string[] {
  const jobs = workflow.jobs;
  const inDegree: Record<string, number> = {};
  const dependents: Record<string, string[]> = {};

  for (const id of Object.keys(jobs)) {
    inDegree[id] = 0;
    dependents[id] = [];
  }

  for (const [id, job] of Object.entries(jobs)) {
    for (const dep of job.needs) {
      if (!(dep in jobs)) throw new Error(`Job "${id}" depends on unknown job "${dep}"`);
      inDegree[id]++;
      dependents[dep].push(id);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of Object.entries(inDegree)) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    sorted.push(current);
    for (const dep of dependents[current]) {
      inDegree[dep]--;
      if (inDegree[dep] === 0) queue.push(dep);
    }
  }

  if (sorted.length !== Object.keys(jobs).length) {
    throw new Error("Circular dependency detected in jobs");
  }

  return sorted;
}

export function getParallelBatches(workflow: Workflow): string[][] {
  const jobs = workflow.jobs;
  const done = new Set<string>();
  const batches: string[][] = [];

  while (done.size < Object.keys(jobs).length) {
    const batch: string[] = [];
    for (const [id, job] of Object.entries(jobs)) {
      if (done.has(id)) continue;
      if (job.needs.every((dep) => done.has(dep))) {
        batch.push(id);
      }
    }
    if (batch.length === 0) throw new Error("Circular dependency detected");
    for (const id of batch) done.add(id);
    batches.push(batch);
  }

  return batches;
}
