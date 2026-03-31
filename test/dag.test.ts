import { describe, it, expect } from "bun:test";
import { getParallelBatches } from "../src/dag";
import type { Workflow } from "../src/types";

function makeWorkflow(jobs: Record<string, { needs?: string[] }>): Workflow {
  const wfJobs: Workflow["jobs"] = {};
  for (const [id, job] of Object.entries(jobs)) {
    wfJobs[id] = { id, needs: job.needs ?? [], steps: [] };
  }
  return { name: "test", jobs: wfJobs };
}

describe("getParallelBatches", () => {
  it("groups independent jobs in one batch", () => {
    const batches = getParallelBatches(makeWorkflow({ a: {}, b: {}, c: {} }));
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });

  it("creates sequential batches for chain", () => {
    const batches = getParallelBatches(makeWorkflow({
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
    const batches = getParallelBatches(makeWorkflow({
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

  it("throws on circular dependency", () => {
    expect(() => getParallelBatches(makeWorkflow({
      a: { needs: ["b"] },
      b: { needs: ["a"] },
    }))).toThrow("Circular");
  });
});
