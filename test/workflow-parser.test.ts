import { describe, it, expect } from "bun:test";
import { parseWorkflow } from "@core/workflow-schema";

function unwrap(raw: string) {
  const result = parseWorkflow(raw);
  if (result.isErr()) throw new Error(result.error);
  return result.value;
}

describe("parseWorkflow", () => {
  it("parses a simple workflow with run steps", () => {
    const wf = unwrap(`
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
    const wf = unwrap(`
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
    const wf = unwrap(`
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
    const wf = unwrap(`
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

  it("returns error on missing jobs", () => {
    const result = parseWorkflow("name: Empty");
    expect(result.isErr()).toBe(true);
  });

  it("handles mixed skill and run steps", () => {
    const wf = unwrap(`
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

  it("parses multiple jobs", () => {
    const wf = unwrap(`
name: Multi
jobs:
  lint:
    steps:
      - run: lint
  test:
    steps:
      - run: test
  deploy:
    needs: [lint, test]
    steps:
      - run: deploy
`);
    expect(Object.keys(wf.jobs)).toHaveLength(3);
    expect(wf.jobs.deploy.needs).toEqual(["lint", "test"]);
  });

  it("defaults name to empty string", () => {
    const wf = unwrap(`
jobs:
  a:
    steps:
      - run: echo
`);
    expect(wf.name).toBe("");
  });

  it("allows empty steps", () => {
    const wf = unwrap(`
name: Empty
jobs:
  a:
    steps: []
`);
    expect(wf.jobs.a.steps).toHaveLength(0);
  });

  it("ignores unknown step fields", () => {
    const wf = unwrap(`
name: Extra
jobs:
  a:
    steps:
      - run: echo hello
        timeout: 30
`);
    expect(wf.jobs.a.steps).toHaveLength(1);
    expect(wf.jobs.a.steps[0].type).toBe("run");
  });

  it("parses skill step without id or inputs", () => {
    const wf = unwrap(`
name: Minimal
jobs:
  a:
    steps:
      - skill: dev/review
`);
    const step = wf.jobs.a.steps[0];
    expect(step.type).toBe("skill");
    if (step.type === "skill") {
      expect(step.skill).toBe("dev/review");
      expect(step.id).toBeUndefined();
      expect(step.inputs).toBeUndefined();
    }
  });

  it("parses multi-line run command", () => {
    const wf = unwrap(`
name: Multiline
jobs:
  a:
    steps:
      - run: |
          echo hello
          echo world
`);
    const step = wf.jobs.a.steps[0];
    if (step.type === "run") {
      expect(step.run).toContain("echo hello");
      expect(step.run).toContain("echo world");
    }
  });

  it("parses complex diamond DAG", () => {
    const wf = unwrap(`
name: Diamond
jobs:
  setup:
    steps:
      - run: echo setup
  build:
    needs: setup
    steps:
      - run: echo build
  test:
    needs: setup
    steps:
      - run: echo test
  deploy:
    needs: [build, test]
    steps:
      - run: echo deploy
`);
    expect(wf.jobs.setup.needs).toEqual([]);
    expect(wf.jobs.build.needs).toEqual(["setup"]);
    expect(wf.jobs.test.needs).toEqual(["setup"]);
    expect(wf.jobs.deploy.needs).toEqual(["build", "test"]);
  });

  it("parses skill with multiple input refs", () => {
    const wf = unwrap(`
name: Refs
jobs:
  a:
    steps:
      - skill: dev/impl
        id: impl
      - skill: dev/integrate
        inputs:
          changes: \${{ steps.impl.outputs.changes }}
          summary: \${{ steps.impl.outputs.summary }}
          config: static-value
`);
    const step = wf.jobs.a.steps[1];
    if (step.type === "skill") {
      expect(step.inputs?.changes).toBe("${{ steps.impl.outputs.changes }}");
      expect(step.inputs?.summary).toBe("${{ steps.impl.outputs.summary }}");
      expect(step.inputs?.config).toBe("static-value");
    }
  });

  it("returns error on invalid yaml", () => {
    expect(parseWorkflow("{{{{").isErr()).toBe(true);
  });

  it("returns error on yaml without jobs key", () => {
    expect(parseWorkflow("steps:\n  - run: echo").isErr()).toBe(true);
  });
});
