import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveWorkflow, clearWorkflowCache } from "../src/paths";

import { tmpdir } from "node:os";
const tmpDir = join(tmpdir(), `onegai-resolver-test-${process.pid}`);
const workflowDir = join(tmpDir, ".claude", "workflows");

function createWorkflow(relPath: string) {
  const full = join(workflowDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, `name: ${relPath}\njobs:\n  a:\n    steps:\n      - run: echo ok\n`);
}

beforeEach(() => {
  clearWorkflowCache();
  mkdirSync(workflowDir, { recursive: true });
});

afterEach(() => {
  clearWorkflowCache();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolveWorkflow", () => {
  it("resolves exact relative path", () => {
    createWorkflow("dev/implement.yml");
    const result = resolveWorkflow(tmpDir, "dev/implement");
    expect(result).toBe(join(workflowDir, "dev/implement.yml"));
  });

  it("resolves exact relative path with .yml extension", () => {
    createWorkflow("dev/implement.yml");
    const result = resolveWorkflow(tmpDir, "dev/implement.yml");
    expect(result).toBe(join(workflowDir, "dev/implement.yml"));
  });

  it("resolves by suffix match on last segment", () => {
    createWorkflow("dev/implement.yml");
    const result = resolveWorkflow(tmpDir, "implement");
    expect(result).toBe(join(workflowDir, "dev/implement.yml"));
  });

  it("resolves by suffix match on multiple segments", () => {
    createWorkflow("team/dev/implement.yml");
    const result = resolveWorkflow(tmpDir, "dev/implement");
    expect(result).toBe(join(workflowDir, "team/dev/implement.yml"));
  });

  it("does not match partial segment", () => {
    createWorkflow("dev/implement.yml");
    const result = resolveWorkflow(tmpDir, "plement");
    expect(result).toBeUndefined();
  });

  it("returns first match when multiple workflows match suffix", () => {
    createWorkflow("a/review.yml");
    createWorkflow("b/review.yml");
    const result = resolveWorkflow(tmpDir, "review");
    expect(result).toBeDefined();
    // First match from the cache (alphabetical within a dir)
    expect(result).toBe(join(workflowDir, "a/review.yml"));
  });

  it("prefers exact match over suffix match", () => {
    createWorkflow("implement.yml");
    createWorkflow("dev/implement.yml");
    const result = resolveWorkflow(tmpDir, "implement");
    expect(result).toBe(join(workflowDir, "implement.yml"));
  });

  it("returns undefined for non-existent workflow", () => {
    createWorkflow("dev/implement.yml");
    const result = resolveWorkflow(tmpDir, "deploy");
    expect(result).toBeUndefined();
  });

  it("uses cache on second call", () => {
    createWorkflow("dev/implement.yml");
    const first = resolveWorkflow(tmpDir, "implement");
    const second = resolveWorkflow(tmpDir, "implement");
    expect(first).toBe(second);
  });
});
