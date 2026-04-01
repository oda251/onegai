import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectWorkflow } from "../src/inspect";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "onegai-inspect-test-"));
  mkdirSync(join(tmpDir, "skills/dev"), { recursive: true });
  mkdirSync(join(tmpDir, "workflows"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("inspectWorkflow", () => {
  it("computes required inputs excluding wired outputs", () => {
    writeFileSync(join(tmpDir, "skills/dev/impl.md"), `---
inputs:
  what: Implementation details
  where:
    description: Target file
    type: plain
---
Work.`);

    writeFileSync(join(tmpDir, "skills/dev/review.md"), `---
inputs:
  changes: Changed files
---
Review.`);

    const wfPath = join(tmpDir, "workflows/implement.yml");
    writeFileSync(wfPath, `
name: Implement
jobs:
  build:
    steps:
      - skill: dev/impl
        id: impl
      - skill: dev/review
        inputs:
          changes: \${{ steps.impl.outputs.changes }}
`);

    const result = inspectWorkflow(wfPath, [join(tmpDir, "skills")]);
    expect(result.name).toBe("Implement");
    expect(result.requiredInputs).toHaveLength(2);

    const keys = result.requiredInputs.map((i) => i.key);
    expect(keys).toContain("what");
    expect(keys).toContain("where");
    expect(keys).not.toContain("changes");

    const what = result.requiredInputs.find((i) => i.key === "what");
    expect(what?.type).toBe("evidenced");
    const where = result.requiredInputs.find((i) => i.key === "where");
    expect(where?.type).toBe("plain");
  });

  it("returns all inputs when no wiring exists", () => {
    writeFileSync(join(tmpDir, "skills/dev/impl.md"), `---
inputs:
  what: Details
---
Work.`);

    const wfPath = join(tmpDir, "workflows/simple.yml");
    writeFileSync(wfPath, `
name: Simple
jobs:
  build:
    steps:
      - skill: dev/impl
`);

    const result = inspectWorkflow(wfPath, [join(tmpDir, "skills")]);
    expect(result.requiredInputs).toHaveLength(1);
    expect(result.requiredInputs[0].key).toBe("what");
  });

  it("handles run-only workflows with no required inputs", () => {
    const wfPath = join(tmpDir, "workflows/lint.yml");
    writeFileSync(wfPath, `
name: Lint
jobs:
  lint:
    steps:
      - run: bun run lint
`);

    const result = inspectWorkflow(wfPath, [join(tmpDir, "skills")]);
    expect(result.requiredInputs).toHaveLength(0);
  });

  it("deduplicates inputs across multiple skills", () => {
    writeFileSync(join(tmpDir, "skills/dev/impl.md"), `---
inputs:
  what: Details
  where:
    description: Target
    type: plain
---
Impl.`);

    writeFileSync(join(tmpDir, "skills/dev/review.md"), `---
inputs:
  what: Details to review
---
Review.`);

    const wfPath = join(tmpDir, "workflows/dup.yml");
    writeFileSync(wfPath, `
name: Dup
jobs:
  build:
    steps:
      - skill: dev/impl
      - skill: dev/review
`);

    const result = inspectWorkflow(wfPath, [join(tmpDir, "skills")]);
    const keys = result.requiredInputs.map((i) => i.key);
    expect(keys.filter((k) => k === "what")).toHaveLength(1);
  });
});
