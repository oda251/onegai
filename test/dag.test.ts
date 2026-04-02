import { describe, it, expect } from "bun:test";
import { getParallelBatches } from "@core/dag";
import type { Workflow } from "@core/types";

function makeWorkflow(jobs: Record<string, { needs?: string[] }>): Workflow {
  const wfJobs: Workflow["jobs"] = {};
  for (const [id, job] of Object.entries(jobs)) {
    wfJobs[id] = { id, needs: job.needs ?? [], steps: [] };
  }
  return { name: "test", jobs: wfJobs };
}

function unwrap(wf: Workflow) {
  const result = getParallelBatches(wf);
  if (result.isErr()) throw new Error(result.error);
  return result.value;
}

describe("getParallelBatches", () => {
  it("groups independent jobs in one batch", () => {
    const batches = unwrap(makeWorkflow({ a: {}, b: {}, c: {} }));
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });

  it("creates sequential batches for chain", () => {
    const batches = unwrap(makeWorkflow({
      a: {},
      b: { needs: ["a"] },
      c: { needs: ["b"] },
    }));
    expect(batches).toHaveLength(3);
    expect(batches[0]).toEqual(["a"]);
    expect(batches[1]).toEqual(["b"]);
    expect(batches[2]).toEqual(["c"]);
  });

  it("parallelizes diamond DAG correctly", () => {
    const batches = unwrap(makeWorkflow({
      a: {},
      b: { needs: ["a"] },
      c: { needs: ["a"] },
      d: { needs: ["b", "c"] },
    }));
    expect(batches).toHaveLength(3);
    expect(batches[0]).toEqual(["a"]);
    expect(batches[1].sort()).toEqual(["b", "c"]);
    expect(batches[2]).toEqual(["d"]);
  });

  it("returns error on circular dependency", () => {
    const result = getParallelBatches(makeWorkflow({
      a: { needs: ["b"] },
      b: { needs: ["a"] },
    }));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toContain("Circular");
  });
});
