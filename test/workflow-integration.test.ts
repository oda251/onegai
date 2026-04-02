import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { appendFileSync } from "node:fs";
import { createTestDir, createSkill, createWorkflow, createSdkMock, type TestDir, type MockBehavior } from "./helpers";

let t: TestDir;
let mockBehavior: MockBehavior;

void mock.module("@anthropic-ai/claude-agent-sdk", () => createSdkMock(() => mockBehavior));

const { runWorkflow } = await import("../src/shell/runner");
const { loadWorkflowFile } = await import("../src/shell/workflow-loader");

function loadOrThrow(path: string) {
  const result = loadWorkflowFile(path);
  if (result.isErr()) throw new Error(result.error);
  return result.value;
}

beforeEach(() => { t = createTestDir("integration"); });
afterEach(() => { t.cleanup(); });

describe("workflow integration", () => {
  it("propagates plain output between steps", async () => {
    createSkill(t.skillsDir, "dev/impl", {
      inputs: { what: { description: "task", type: "plain" } },
      body: "Implement.",
    });
    createSkill(t.skillsDir, "dev/review", {
      inputs: { changes: { description: "changes to review", type: "plain" } },
      body: "Review.",
    });

    const capturedPrompts: string[] = [];
    mockBehavior = (prompt, env) => {
      capturedPrompts.push(prompt);
      if (prompt.includes("Implement")) {
        appendFileSync(env.GITHUB_OUTPUT, "changes=src/auth.ts modified\n");
      }
    };

    const wfPath = createWorkflow(t.workflowsDir, "test", {
      jobs: {
        build: {
          steps: [
            { skill: "dev/impl", id: "impl", inputs: { what: "add auth" } },
            { skill: "dev/review", inputs: { changes: "${{ steps.impl.outputs.changes }}" } },
          ],
        },
      },
    });

    const result = await runWorkflow(
      loadOrThrow(wfPath),
      { cwd: t.root, skillsDirs: [t.skillsDir], workflowFile: "test.yml", inputs: {}, runStoreDir: t.runStoreDir, callerMode: "human" },
    );

    expect(result.status).toBe("done");
    expect(capturedPrompts[1]).toContain("src/auth.ts modified");
  });

  it("propagates evidenced output between steps", async () => {
    createSkill(t.skillsDir, "dev/impl", {
      inputs: { what: { description: "task", type: "plain" } },
      body: "Implement.",
    });
    createSkill(t.skillsDir, "dev/review", {
      inputs: { changes: "changes" },
      body: "Review.",
    });

    const capturedPrompts: string[] = [];
    mockBehavior = (prompt, env) => {
      capturedPrompts.push(prompt);
      if (prompt.includes("Implement")) {
        const evidenced = JSON.stringify({
          type: "evidenced",
          body: "added JWT auth",
          citations: [{ type: "uri", source: "src/auth.ts", excerpt: "app.use(jwt())" }],
        });
        appendFileSync(env.GITHUB_OUTPUT, `changes<<EOF\n${evidenced}\nEOF\n`);
      }
    };

    const wfPath = createWorkflow(t.workflowsDir, "test", {
      jobs: {
        build: {
          steps: [
            { skill: "dev/impl", id: "impl", inputs: { what: "add auth" } },
            { skill: "dev/review", inputs: { changes: "${{ steps.impl.outputs.changes }}" } },
          ],
        },
      },
    });

    const result = await runWorkflow(
      loadOrThrow(wfPath),
      { cwd: t.root, skillsDirs: [t.skillsDir], workflowFile: "test.yml", inputs: {}, runStoreDir: t.runStoreDir, callerMode: "human" },
    );

    expect(result.status).toBe("done");
    expect(capturedPrompts[1]).toContain("added JWT auth");
    expect(capturedPrompts[1]).toContain("src/auth.ts");
    expect(capturedPrompts[1]).toContain("app.use(jwt())");
  });

  it("stores evidenced output in step results", async () => {
    createSkill(t.skillsDir, "dev/impl", {
      inputs: { what: { description: "task", type: "plain" } },
      body: "Implement.",
    });

    mockBehavior = (_prompt, env) => {
      const evidenced = JSON.stringify({
        type: "evidenced",
        body: "refactored",
        citations: [{ type: "uri", source: "src/main.ts", excerpt: "export function" }],
      });
      appendFileSync(env.GITHUB_OUTPUT, `result<<EOF\n${evidenced}\nEOF\n`);
    };

    const wfPath = createWorkflow(t.workflowsDir, "test", {
      jobs: { build: { steps: [{ skill: "dev/impl", id: "impl", inputs: { what: "refactor" } }] } },
    });

    const result = await runWorkflow(
      loadOrThrow(wfPath),
      { cwd: t.root, skillsDirs: [t.skillsDir], workflowFile: "test.yml", inputs: {}, runStoreDir: t.runStoreDir, callerMode: "human" },
    );

    expect(result.status).toBe("done");
    const output = result.jobs.build.steps[0].outputs.result;
    expect(output.type).toBe("evidenced");
    if (output.type === "evidenced") {
      expect(output.body).toBe("refactored");
      expect(output.citations).toHaveLength(1);
    }
  });

  it("errors when evidenced output is mixed with text", async () => {
    createSkill(t.skillsDir, "dev/impl", {
      inputs: { what: { description: "task", type: "plain" } },
      body: "Implement.",
    });
    createSkill(t.skillsDir, "dev/report", {
      inputs: { summary: { description: "summary", type: "plain" } },
      body: "Report.",
    });

    mockBehavior = (_prompt, env) => {
      const evidenced = JSON.stringify({
        type: "evidenced",
        body: "auth changes",
        citations: [{ type: "uri", source: "src/auth.ts", excerpt: "jwt" }],
      });
      appendFileSync(env.GITHUB_OUTPUT, `changes<<EOF\n${evidenced}\nEOF\n`);
    };

    const wfPath = createWorkflow(t.workflowsDir, "test", {
      jobs: {
        build: {
          steps: [
            { skill: "dev/impl", id: "impl", inputs: { what: "add auth" } },
            { skill: "dev/report", inputs: { summary: "Result: ${{ steps.impl.outputs.changes }}" } },
          ],
        },
      },
    });

    const result = await runWorkflow(
      loadOrThrow(wfPath),
      { cwd: t.root, skillsDirs: [t.skillsDir], workflowFile: "test.yml", inputs: {}, runStoreDir: t.runStoreDir, callerMode: "human" },
    );

    expect(result.status).toBe("failed");
    expect(result.jobs.build.steps[1].error).toContain("evidenced output cannot be mixed with text");
  });

  it("validates evidenced type in agent mode", async () => {
    createSkill(t.skillsDir, "dev/review", { inputs: { changes: "changes" }, body: "Review." });

    mockBehavior = (_prompt, env) => {
      appendFileSync(env.GITHUB_OUTPUT, "changes=just plain text\n");
    };

    const wfPath = createWorkflow(t.workflowsDir, "test", {
      jobs: {
        build: {
          steps: [
            { run: "echo ok", id: "prep" },
            { skill: "dev/review", inputs: { changes: "${{ steps.prep.outputs.changes }}" } },
          ],
        },
      },
    });

    const result = await runWorkflow(
      loadOrThrow(wfPath),
      { cwd: t.root, skillsDirs: [t.skillsDir], workflowFile: "test.yml", inputs: {}, runStoreDir: t.runStoreDir, callerMode: "agent" },
    );

    expect(result.status).toBe("failed");
    expect(result.jobs.build.steps[1].error).toContain("expected evidenced");
  });

  it("skips type validation in human mode", async () => {
    createSkill(t.skillsDir, "dev/review", { inputs: { changes: "changes" }, body: "Review." });
    mockBehavior = () => {};

    const wfPath = createWorkflow(t.workflowsDir, "test", {
      jobs: { build: { steps: [{ skill: "dev/review", inputs: { changes: "just text" } }] } },
    });

    const result = await runWorkflow(
      loadOrThrow(wfPath),
      { cwd: t.root, skillsDirs: [t.skillsDir], workflowFile: "test.yml", inputs: {}, runStoreDir: t.runStoreDir, callerMode: "human" },
    );

    expect(result.status).toBe("done");
  });

  it("handles run step output flowing to skill step", async () => {
    createSkill(t.skillsDir, "dev/review", {
      inputs: { changes: { description: "changes", type: "plain" } },
      body: "Review.",
    });

    const capturedPrompts: string[] = [];
    mockBehavior = (prompt) => { capturedPrompts.push(prompt); };

    const wfPath = createWorkflow(t.workflowsDir, "test", {
      jobs: {
        build: {
          steps: [
            { run: 'echo "changes=file1.ts,file2.ts" >> $GITHUB_OUTPUT', id: "check" },
            { skill: "dev/review", inputs: { changes: "${{ steps.check.outputs.changes }}" } },
          ],
        },
      },
    });

    const result = await runWorkflow(
      loadOrThrow(wfPath),
      { cwd: t.root, skillsDirs: [t.skillsDir], workflowFile: "test.yml", inputs: {}, runStoreDir: t.runStoreDir, callerMode: "human" },
    );

    expect(result.status).toBe("done");
    expect(capturedPrompts[0]).toContain("file1.ts,file2.ts");
  });

  it("propagates multiple outputs including mixed types", async () => {
    createSkill(t.skillsDir, "dev/impl", {
      inputs: { what: { description: "task", type: "plain" } },
      body: "Implement.",
    });
    createSkill(t.skillsDir, "dev/report", {
      inputs: { changes: "evidenced changes", summary: { description: "plain summary", type: "plain" } },
      body: "Report.",
    });

    const capturedPrompts: string[] = [];
    mockBehavior = (prompt, env) => {
      capturedPrompts.push(prompt);
      if (prompt.includes("Implement")) {
        const evidenced = JSON.stringify({
          type: "evidenced",
          body: "auth migration",
          citations: [{ type: "uri", source: "src/auth.ts", excerpt: "jwt.verify()" }],
        });
        appendFileSync(env.GITHUB_OUTPUT, `changes<<EOF\n${evidenced}\nEOF\n`);
        appendFileSync(env.GITHUB_OUTPUT, "summary=3 files changed\n");
      }
    };

    const wfPath = createWorkflow(t.workflowsDir, "test", {
      jobs: {
        build: {
          steps: [
            { skill: "dev/impl", id: "impl", inputs: { what: "migrate" } },
            {
              skill: "dev/report",
              inputs: {
                changes: "${{ steps.impl.outputs.changes }}",
                summary: "${{ steps.impl.outputs.summary }}",
              },
            },
          ],
        },
      },
    });

    const result = await runWorkflow(
      loadOrThrow(wfPath),
      { cwd: t.root, skillsDirs: [t.skillsDir], workflowFile: "test.yml", inputs: {}, runStoreDir: t.runStoreDir, callerMode: "human" },
    );

    expect(result.status).toBe("done");
    expect(capturedPrompts[1]).toContain("auth migration");
    expect(capturedPrompts[1]).toContain("src/auth.ts");
    expect(capturedPrompts[1]).toContain("jwt.verify()");
    expect(capturedPrompts[1]).toContain("3 files changed");
  });
});
