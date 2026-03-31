import { describe, it, expect } from "bun:test";
import { parseWorkflow } from "../src/workflow-parser.js";

describe("parseWorkflow", () => {
  it("parses a simple workflow with run steps", () => {
    const wf = parseWorkflow(`
name: Test
jobs:
  lint:
    steps:
      - run: bun run lint
      - run: bun test
`);
    expect(wf.name).toBe("Test");
    expect(Object.keys(wf.jobs)).toEqual(["lint"]);
    expect(wf.jobs.lint.steps).toHaveLength(2);
    expect(wf.jobs.lint.steps[0].type).toBe("run");
    expect(wf.jobs.lint.needs).toEqual([]);
  });

  it("parses skill steps with id and inputs", () => {
    const wf = parseWorkflow(`
name: Dev
jobs:
  impl:
    steps:
      - skill: dev/impl
        id: impl
      - skill: dev/review
        inputs:
          changes: \${{ steps.impl.outputs.changes }}
`);
    expect(wf.jobs.impl.steps).toHaveLength(2);
    const s0 = wf.jobs.impl.steps[0];
    expect(s0.type).toBe("skill");
    if (s0.type === "skill") {
      expect(s0.skill).toBe("dev/impl");
      expect(s0.id).toBe("impl");
    }
    const s1 = wf.jobs.impl.steps[1];
    if (s1.type === "skill") {
      expect(s1.inputs?.changes).toBe("${{ steps.impl.outputs.changes }}");
    }
  });

  it("parses needs as array", () => {
    const wf = parseWorkflow(`
name: DAG
jobs:
  a:
    steps:
      - run: echo a
  b:
    steps:
      - run: echo b
  c:
    needs: [a, b]
    steps:
      - run: echo c
`);
    expect(wf.jobs.c.needs).toEqual(["a", "b"]);
  });

  it("parses needs as single string", () => {
    const wf = parseWorkflow(`
name: Single
jobs:
  a:
    steps:
      - run: echo a
  b:
    needs: a
    steps:
      - run: echo b
`);
    expect(wf.jobs.b.needs).toEqual(["a"]);
  });

  it("throws on missing jobs", () => {
    expect(() => parseWorkflow("name: Empty")).toThrow();
  });

  it("handles mixed skill and run steps", () => {
    const wf = parseWorkflow(`
name: Mixed
jobs:
  build:
    steps:
      - skill: dev/impl
        id: impl
      - run: bun run lint
      - skill: dev/review
`);
    expect(wf.jobs.build.steps).toHaveLength(3);
    expect(wf.jobs.build.steps[0].type).toBe("skill");
    expect(wf.jobs.build.steps[1].type).toBe("run");
    expect(wf.jobs.build.steps[2].type).toBe("skill");
  });
});
