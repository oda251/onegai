import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { inspectWorkflow } from "@shell/inspect";
import { createTestDir, createSkill, createWorkflow, type TestDir } from "./helpers";

let t: TestDir;

beforeEach(() => { t = createTestDir("inspect"); });
afterEach(() => { t.cleanup(); });

describe("inspectWorkflow", () => {
  it("computes required inputs excluding wired outputs", () => {
    createSkill(t.skillsDir, "dev/impl", {
      inputs: { what: "Implementation details", where: { description: "Target file", type: "plain" } },
    });
    createSkill(t.skillsDir, "dev/review", { inputs: { changes: "Changed files" }, body: "Review." });

    const wfPath = createWorkflow(t.workflowsDir, "implement", {
      name: "Implement",
      jobs: {
        build: {
          steps: [
            { skill: "dev/impl", id: "impl" },
            { skill: "dev/review", inputs: { changes: "${{ steps.impl.outputs.changes }}" } },
          ],
        },
      },
    });

    const result = inspectWorkflow(wfPath, [t.skillsDir]);
    expect(result.name).toBe("Implement");
    expect(result.requiredInputs).toHaveLength(2);

    const keys = result.requiredInputs.map((i) => i.key);
    expect(keys).toContain("what");
    expect(keys).toContain("where");
    expect(keys).not.toContain("changes");

    expect(result.requiredInputs.find((i) => i.key === "what")?.type).toBe("evidenced");
    expect(result.requiredInputs.find((i) => i.key === "where")?.type).toBe("plain");
  });

  it("returns all inputs when no wiring exists", () => {
    createSkill(t.skillsDir, "dev/impl");

    const wfPath = createWorkflow(t.workflowsDir, "simple", {
      name: "Simple",
      jobs: { build: { steps: [{ skill: "dev/impl" }] } },
    });

    const result = inspectWorkflow(wfPath, [t.skillsDir]);
    expect(result.requiredInputs).toHaveLength(1);
    expect(result.requiredInputs[0].key).toBe("what");
  });

  it("handles run-only workflows with no required inputs", () => {
    const wfPath = createWorkflow(t.workflowsDir, "lint", {
      name: "Lint",
      jobs: { lint: { steps: [{ run: "bun run lint" }] } },
    });

    const result = inspectWorkflow(wfPath, [t.skillsDir]);
    expect(result.requiredInputs).toHaveLength(0);
  });

  it("deduplicates inputs across multiple skills", () => {
    createSkill(t.skillsDir, "dev/impl", {
      inputs: { what: "Details", where: { description: "Target", type: "plain" } },
      body: "Impl.",
    });
    createSkill(t.skillsDir, "dev/review", { inputs: { what: "Details to review" }, body: "Review." });

    const wfPath = createWorkflow(t.workflowsDir, "dup", {
      name: "Dup",
      jobs: {
        build: { steps: [{ skill: "dev/impl" }, { skill: "dev/review" }] },
      },
    });

    const result = inspectWorkflow(wfPath, [t.skillsDir]);
    const keys = result.requiredInputs.map((i) => i.key);
    expect(keys.filter((k) => k === "what")).toHaveLength(1);
  });
});
