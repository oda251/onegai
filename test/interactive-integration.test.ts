import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createTestDir, createSkill, createWorkflow, createSdkMock, type TestDir, type MockBehavior } from "./helpers";

let t: TestDir;
let mockBehavior: MockBehavior;

void mock.module("@anthropic-ai/claude-agent-sdk", () => createSdkMock(() => mockBehavior));

const { launchInteractive } = await import("../src/shell/interactive-launcher");

beforeEach(() => { t = createTestDir("interactive"); });
afterEach(() => { t.cleanup(); });

describe("launchInteractive", () => {
  it("runs interactive skill with required inputs in prompt", async () => {
    createSkill(t.skillsDir, "dev/impl", {
      inputs: { what: "実装内容", where: { description: "対象ファイル", type: "plain" } },
      body: "Implement.",
    });

    const wfPath = createWorkflow(t.workflowsDir, "dev/implement", {
      name: "Implement",
      jobs: { build: { steps: [{ skill: "dev/impl" }] } },
    });

    const capturedPrompts: string[] = [];
    mockBehavior = (prompt) => { capturedPrompts.push(prompt); };

    await launchInteractive({ workflowPath: wfPath, cwd: t.root, skillsDirs: [t.skillsDir], runStoreDir: t.runStoreDir });

    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0]).toContain("what");
    expect(capturedPrompts[0]).toContain("evidenced");
    expect(capturedPrompts[0]).toContain("実装内容");
    expect(capturedPrompts[0]).toContain("where");
    expect(capturedPrompts[0]).toContain("plain");
    expect(capturedPrompts[0]).toContain("対象ファイル");
  });

  it("passes workflow path to the interactive skill", async () => {
    createSkill(t.skillsDir, "dev/impl", { inputs: { what: "実装内容" }, body: "Implement." });

    const wfPath = createWorkflow(t.workflowsDir, "dev/implement", {
      name: "Implement",
      jobs: { build: { steps: [{ skill: "dev/impl" }] } },
    });

    const capturedPrompts: string[] = [];
    mockBehavior = (prompt) => { capturedPrompts.push(prompt); };

    await launchInteractive({ workflowPath: wfPath, cwd: t.root, skillsDirs: [t.skillsDir], runStoreDir: t.runStoreDir });

    expect(capturedPrompts[0]).toContain("implement.yml");
  });

  it("provides Bash tool so interactive skill can run onegai", async () => {
    createSkill(t.skillsDir, "dev/impl", { inputs: { what: "実装内容" }, body: "Implement." });

    const wfPath = createWorkflow(t.workflowsDir, "dev/implement", {
      name: "Implement",
      jobs: { build: { steps: [{ skill: "dev/impl" }] } },
    });

    let capturedAllowedTools: string[] | undefined;
    void mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: ({ options }: { prompt: string; options: { allowedTools?: string[] } }) => {
        capturedAllowedTools = options.allowedTools;
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "result", result: "done" };
          },
        };
      },
    }));

    const { launchInteractive: li } = await import("../src/shell/interactive-launcher");
    await li({ workflowPath: wfPath, cwd: t.root, skillsDirs: [t.skillsDir], runStoreDir: t.runStoreDir });

    expect(capturedAllowedTools).toContain("Bash");
  });
});
