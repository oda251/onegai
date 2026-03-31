import { describe, it, expect } from "bun:test";
import { topologicalSort, getParallelBatches } from "../src/dag.js";
import type { Workflow } from "../src/types.js";

function makeWorkflow(jobs: Record<string, { needs?: string[] }>): Workflow {
  const wfJobs: Workflow["jobs"] = {};
  for (const [id, job] of Object.entries(jobs)) {
    wfJobs[id] = { id, needs: job.needs ?? [], steps: [] };
  }
  return { name: "test", jobs: wfJobs };
}

describe("topologicalSort", () => {
  it("sorts independent jobs", () => {
    const sorted = topologicalSort(makeWorkflow({ a: {}, b: {}, c: {} }));
    expect(sorted).toHaveLength(3);
    expect(sorted).toContain("a");
    expect(sorted).toContain("b");
    expect(sorted).toContain("c");
  });

  it("sorts linear chain", () => {
    const sorted = topologicalSort(makeWorkflow({
      a: {},
      b: { needs: ["a"] },
      c: { needs: ["b"] },
    }));
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("c"));
  });

  it("sorts diamond DAG", () => {
    const sorted = topologicalSort(makeWorkflow({
      a: {},
      b: { needs: ["a"] },
      c: { needs: ["a"] },
      d: { needs: ["b", "c"] },
    }));
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("c"));
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("d"));
    expect(sorted.indexOf("c")).toBeLessThan(sorted.indexOf("d"));
  });

  it("throws on circular dependency", () => {
    expect(() => topologicalSort(makeWorkflow({
      a: { needs: ["b"] },
      b: { needs: ["a"] },
    }))).toThrow("Circular");
  });

  it("throws on unknown dependency", () => {
    expect(() => topologicalSort(makeWorkflow({
      a: { needs: ["nonexistent"] },
    }))).toThrow("unknown job");
  });
});

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
