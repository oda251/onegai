import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { resolveWorkflow, clearWorkflowCache } from "@shell/paths";
import { createTestDir, createWorkflow, type TestDir } from "./helpers";

let t: TestDir;
const wfDir = () => join(t.root, ".claude", "workflows");

beforeEach(() => {
  clearWorkflowCache();
  t = createTestDir("resolver");
});

afterEach(() => {
  clearWorkflowCache();
  t.cleanup();
});

// resolveWorkflow searches .claude/workflows/ via resolveWorkflowsDirs,
// so we create workflows there instead of t.workflowsDir
function addWorkflow(relPath: string) {
  createWorkflow(wfDir(), relPath, {
    jobs: { a: { steps: [{ run: "echo ok" }] } },
  });
}

describe("resolveWorkflow", () => {
  it("resolves exact relative path", () => {
    addWorkflow("dev/implement");
    const result = resolveWorkflow(t.root, "dev/implement");
    expect(result).toBe(join(wfDir(), "dev/implement.yml"));
  });

  it("resolves exact relative path with .yml extension", () => {
    addWorkflow("dev/implement");
    const result = resolveWorkflow(t.root, "dev/implement.yml");
    expect(result).toBe(join(wfDir(), "dev/implement.yml"));
  });

  it("resolves by suffix match on last segment", () => {
    addWorkflow("dev/implement");
    const result = resolveWorkflow(t.root, "implement");
    expect(result).toBe(join(wfDir(), "dev/implement.yml"));
  });

  it("resolves by suffix match on multiple segments", () => {
    addWorkflow("team/dev/implement");
    const result = resolveWorkflow(t.root, "dev/implement");
    expect(result).toBe(join(wfDir(), "team/dev/implement.yml"));
  });

  it("does not match partial segment", () => {
    addWorkflow("dev/implement");
    const result = resolveWorkflow(t.root, "plement");
    expect(result).toBeUndefined();
  });

  it("returns first match when multiple workflows match suffix", () => {
    addWorkflow("a/review");
    addWorkflow("b/review");
    const result = resolveWorkflow(t.root, "review");
    expect(result).toBeDefined();
    expect(result).toBe(join(wfDir(), "a/review.yml"));
  });

  it("prefers exact match over suffix match", () => {
    addWorkflow("implement");
    addWorkflow("dev/implement");
    const result = resolveWorkflow(t.root, "implement");
    expect(result).toBe(join(wfDir(), "implement.yml"));
  });

  it("returns undefined for non-existent workflow", () => {
    addWorkflow("dev/implement");
    const result = resolveWorkflow(t.root, "deploy");
    expect(result).toBeUndefined();
  });

  it("uses cache on second call", () => {
    addWorkflow("dev/implement");
    const first = resolveWorkflow(t.root, "implement");
    const second = resolveWorkflow(t.root, "implement");
    expect(first).toBe(second);
  });
});
