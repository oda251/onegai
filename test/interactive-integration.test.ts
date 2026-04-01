import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let mockBehavior: (prompt: string, env: Record<string, string>) => void;

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: ({ prompt, options }: { prompt: string; options: { env?: Record<string, string> } }) => {
    mockBehavior(prompt, options.env ?? {});
    return {
      async *[Symbol.asyncIterator]() {
        yield { type: "result", result: "done" };
      },
    };
  },
}));

const { launchInteractive } = await import("../src/interactive-launcher");

let tmpDir: string;
let skillsDir: string;
let runStoreDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "onegai-interactive-"));
  skillsDir = join(tmpDir, "skills");
  runStoreDir = join(tmpDir, "runs");
  mkdirSync(join(skillsDir, "dev"), { recursive: true });
  mkdirSync(runStoreDir, { recursive: true });
  mkdirSync(join(tmpDir, "workflows", "dev"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("launchInteractive", () => {
  it("runs interactive skill with required inputs in prompt", async () => {
    writeFileSync(join(skillsDir, "dev/impl.md"), `---
inputs:
  what: 実装内容
  where:
    description: 対象ファイル
    type: plain
---
Implement.`);

    writeFileSync(join(tmpDir, "workflows/dev/implement.yml"), `name: Implement
jobs:
  build:
    steps:
      - skill: dev/impl
        id: impl
`);

    const capturedPrompts: string[] = [];
    mockBehavior = (prompt) => {
      capturedPrompts.push(prompt);
    };

    await launchInteractive({
      workflowPath: join(tmpDir, "workflows/dev/implement.yml"),
      cwd: tmpDir,
      skillsDirs: [skillsDir],
      runStoreDir,
    });

    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0]).toContain("what");
    expect(capturedPrompts[0]).toContain("evidenced");
    expect(capturedPrompts[0]).toContain("実装内容");
    expect(capturedPrompts[0]).toContain("where");
    expect(capturedPrompts[0]).toContain("plain");
    expect(capturedPrompts[0]).toContain("対象ファイル");
  });

  it("passes workflow path to the interactive skill", async () => {
    writeFileSync(join(skillsDir, "dev/impl.md"), `---
inputs:
  what: 実装内容
---
Implement.`);

    const wfPath = join(tmpDir, "workflows/dev/implement.yml");
    writeFileSync(wfPath, `name: Implement
jobs:
  build:
    steps:
      - skill: dev/impl
`);

    const capturedPrompts: string[] = [];
    mockBehavior = (prompt) => {
      capturedPrompts.push(prompt);
    };

    await launchInteractive({
      workflowPath: wfPath,
      cwd: tmpDir,
      skillsDirs: [skillsDir],
      runStoreDir,
    });

    expect(capturedPrompts[0]).toContain("implement.yml");
  });

  it("provides Bash tool so interactive skill can run onegai", async () => {
    writeFileSync(join(skillsDir, "dev/impl.md"), `---
inputs:
  what: 実装内容
---
Implement.`);

    writeFileSync(join(tmpDir, "workflows/dev/implement.yml"), `name: Implement
jobs:
  build:
    steps:
      - skill: dev/impl
`);

    let capturedAllowedTools: string[] | undefined;
    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: ({ options }: { prompt: string; options: { allowedTools?: string[] } }) => {
        capturedAllowedTools = options.allowedTools;
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "result", result: "done" };
          },
        };
      },
    }));

    const { launchInteractive: li } = await import("../src/interactive-launcher");
    await li({
      workflowPath: join(tmpDir, "workflows/dev/implement.yml"),
      cwd: tmpDir,
      skillsDirs: [skillsDir],
      runStoreDir,
    });

    expect(capturedAllowedTools).toContain("Bash");
  });
});
