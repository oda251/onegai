import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// Mock the Claude Agent SDK: the mock query writes to GITHUB_OUTPUT
// based on a configurable behavior function
let mockBehavior: (prompt: string, env: Record<string, string>) => void;

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: ({ prompt, options }: { prompt: string; options: { env: Record<string, string> } }) => {
    const outputFile = options.env.GITHUB_OUTPUT;
    mockBehavior(prompt, { ...options.env, GITHUB_OUTPUT: outputFile });
    return {
      async *[Symbol.asyncIterator]() {
        yield { type: "result", result: "done" };
      },
    };
  },
}));

// Import after mock setup
const { runWorkflow } = await import("../src/runner");

let tmpDir: string;
let skillsDir: string;
let runStoreDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "onegai-integration-"));
  skillsDir = join(tmpDir, "skills");
  runStoreDir = join(tmpDir, "runs");
  mkdirSync(join(skillsDir, "dev"), { recursive: true });
  mkdirSync(runStoreDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSkill(name: string, content: string) {
  const dir = join(skillsDir, name, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(skillsDir, `${name}.md`), content);
}

describe("workflow integration", () => {
  it("propagates plain output between steps", async () => {
    writeSkill("dev/impl", `---
inputs:
  what:
    description: task
    type: plain
---
Implement.`);

    writeSkill("dev/review", `---
inputs:
  changes:
    description: changes to review
    type: plain
---
Review.`);

    const capturedPrompts: string[] = [];
    mockBehavior = (prompt, env) => {
      capturedPrompts.push(prompt);
      if (prompt.includes("Implement")) {
        appendFileSync(env.GITHUB_OUTPUT, "changes=src/auth.ts modified\n");
      }
    };

    const result = await runWorkflow(
      {
        name: "test",
        jobs: {
          build: {
            id: "build",
            needs: [],
            steps: [
              { type: "skill", skill: "dev/impl", id: "impl", inputs: { what: "add auth" } },
              { type: "skill", skill: "dev/review", inputs: { changes: "${{ steps.impl.outputs.changes }}" } },
            ],
          },
        },
      },
      {
        cwd: tmpDir,
        skillsDirs: [skillsDir],
        workflowFile: "test.yml",
        inputs: {},
        runStoreDir,
        callerMode: "human",
      },
    );

    expect(result.status).toBe("done");
    // The review step should receive the plain output from impl
    expect(capturedPrompts[1]).toContain("src/auth.ts modified");
  });

  it("propagates evidenced output between steps", async () => {
    writeSkill("dev/impl", `---
inputs:
  what:
    description: task
    type: plain
---
Implement.`);

    writeSkill("dev/review", `---
inputs:
  changes:
    description: changes
    type: evidenced
---
Review.`);

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

    const result = await runWorkflow(
      {
        name: "test",
        jobs: {
          build: {
            id: "build",
            needs: [],
            steps: [
              { type: "skill", skill: "dev/impl", id: "impl", inputs: { what: "add auth" } },
              { type: "skill", skill: "dev/review", inputs: { changes: "${{ steps.impl.outputs.changes }}" } },
            ],
          },
        },
      },
      {
        cwd: tmpDir,
        skillsDirs: [skillsDir],
        workflowFile: "test.yml",
        inputs: {},
        runStoreDir,
        callerMode: "human",
      },
    );

    expect(result.status).toBe("done");
    // The review step should receive evidenced with citation in prompt
    expect(capturedPrompts[1]).toContain("added JWT auth");
    expect(capturedPrompts[1]).toContain("src/auth.ts");
    expect(capturedPrompts[1]).toContain("app.use(jwt())");
  });

  it("stores evidenced output in step results", async () => {
    writeSkill("dev/impl", `---
inputs:
  what:
    description: task
    type: plain
---
Implement.`);

    mockBehavior = (prompt, env) => {
      const evidenced = JSON.stringify({
        type: "evidenced",
        body: "refactored",
        citations: [{ type: "uri", source: "src/main.ts", excerpt: "export function" }],
      });
      appendFileSync(env.GITHUB_OUTPUT, `result<<EOF\n${evidenced}\nEOF\n`);
    };

    const result = await runWorkflow(
      {
        name: "test",
        jobs: {
          build: {
            id: "build",
            needs: [],
            steps: [
              { type: "skill", skill: "dev/impl", id: "impl", inputs: { what: "refactor" } },
            ],
          },
        },
      },
      {
        cwd: tmpDir,
        skillsDirs: [skillsDir],
        workflowFile: "test.yml",
        inputs: {},
        runStoreDir,
        callerMode: "human",
      },
    );

    expect(result.status).toBe("done");
    const output = result.jobs.build.steps[0].outputs.result;
    expect(output.type).toBe("evidenced");
    if (output.type === "evidenced") {
      expect(output.body).toBe("refactored");
      expect(output.citations).toHaveLength(1);
      expect(output.citations[0]).toEqual({ type: "uri", source: "src/main.ts", excerpt: "export function" });
    }
  });

  it("errors when evidenced output is mixed with text", async () => {
    writeSkill("dev/impl", `---
inputs:
  what:
    description: task
    type: plain
---
Implement.`);

    writeSkill("dev/report", `---
inputs:
  summary:
    description: summary
    type: plain
---
Report.`);

    mockBehavior = (_prompt, env) => {
      const evidenced = JSON.stringify({
        type: "evidenced",
        body: "auth changes",
        citations: [{ type: "uri", source: "src/auth.ts", excerpt: "jwt" }],
      });
      appendFileSync(env.GITHUB_OUTPUT, `changes<<EOF\n${evidenced}\nEOF\n`);
    };

    const result = await runWorkflow(
      {
        name: "test",
        jobs: {
          build: {
            id: "build",
            needs: [],
            steps: [
              { type: "skill", skill: "dev/impl", id: "impl", inputs: { what: "add auth" } },
              { type: "skill", skill: "dev/report", inputs: { summary: "Result: ${{ steps.impl.outputs.changes }}" } },
            ],
          },
        },
      },
      {
        cwd: tmpDir,
        skillsDirs: [skillsDir],
        workflowFile: "test.yml",
        inputs: {},
        runStoreDir,
        callerMode: "human",
      },
    );

    expect(result.status).toBe("failed");
    expect(result.jobs.build.steps[1].error).toContain("evidenced output cannot be mixed with text");
  });

  it("validates evidenced type in agent mode", async () => {
    writeSkill("dev/review", `---
inputs:
  changes:
    description: changes
    type: evidenced
---
Review.`);

    mockBehavior = (_prompt, env) => {
      // First step outputs plain, not evidenced
      appendFileSync(env.GITHUB_OUTPUT, "changes=just plain text\n");
    };

    const result = await runWorkflow(
      {
        name: "test",
        jobs: {
          build: {
            id: "build",
            needs: [],
            steps: [
              { type: "run", run: "echo ok", id: "prep" },
              { type: "skill", skill: "dev/review", inputs: { changes: "${{ steps.prep.outputs.changes }}" } },
            ],
          },
        },
      },
      {
        cwd: tmpDir,
        skillsDirs: [skillsDir],
        workflowFile: "test.yml",
        inputs: {},
        runStoreDir,
        callerMode: "agent",
      },
    );

    // The review step expects evidenced but gets plain → should fail in agent mode
    expect(result.status).toBe("failed");
    expect(result.jobs.build.steps[1].error).toContain("expected evidenced");
  });

  it("skips type validation in human mode", async () => {
    writeSkill("dev/review", `---
inputs:
  changes:
    description: changes
    type: evidenced
---
Review.`);

    mockBehavior = () => {};

    const result = await runWorkflow(
      {
        name: "test",
        jobs: {
          build: {
            id: "build",
            needs: [],
            steps: [
              { type: "skill", skill: "dev/review", inputs: { changes: "just text" } },
            ],
          },
        },
      },
      {
        cwd: tmpDir,
        skillsDirs: [skillsDir],
        workflowFile: "test.yml",
        inputs: {},
        runStoreDir,
        callerMode: "human",
      },
    );

    expect(result.status).toBe("done");
  });

  it("handles run step output flowing to skill step", async () => {
    writeSkill("dev/review", `---
inputs:
  changes:
    description: changes
    type: plain
---
Review.`);

    const capturedPrompts: string[] = [];
    mockBehavior = (prompt) => {
      capturedPrompts.push(prompt);
    };

    const result = await runWorkflow(
      {
        name: "test",
        jobs: {
          build: {
            id: "build",
            needs: [],
            steps: [
              { type: "run", run: 'echo "changes=file1.ts,file2.ts" >> $GITHUB_OUTPUT', id: "check" },
              { type: "skill", skill: "dev/review", inputs: { changes: "${{ steps.check.outputs.changes }}" } },
            ],
          },
        },
      },
      {
        cwd: tmpDir,
        skillsDirs: [skillsDir],
        workflowFile: "test.yml",
        inputs: {},
        runStoreDir,
        callerMode: "human",
      },
    );

    expect(result.status).toBe("done");
    expect(capturedPrompts[0]).toContain("file1.ts,file2.ts");
  });

  it("propagates multiple outputs including mixed types", async () => {
    writeSkill("dev/impl", `---
inputs:
  what:
    description: task
    type: plain
---
Implement.`);

    writeSkill("dev/report", `---
inputs:
  changes:
    description: evidenced changes
    type: evidenced
  summary:
    description: plain summary
    type: plain
---
Report.`);

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

    const result = await runWorkflow(
      {
        name: "test",
        jobs: {
          build: {
            id: "build",
            needs: [],
            steps: [
              { type: "skill", skill: "dev/impl", id: "impl", inputs: { what: "migrate" } },
              {
                type: "skill",
                skill: "dev/report",
                inputs: {
                  changes: "${{ steps.impl.outputs.changes }}",
                  summary: "${{ steps.impl.outputs.summary }}",
                },
              },
            ],
          },
        },
      },
      {
        cwd: tmpDir,
        skillsDirs: [skillsDir],
        workflowFile: "test.yml",
        inputs: {},
        runStoreDir,
        callerMode: "human",
      },
    );

    expect(result.status).toBe("done");
    // Report step should see evidenced changes with citations
    expect(capturedPrompts[1]).toContain("auth migration");
    expect(capturedPrompts[1]).toContain("src/auth.ts");
    expect(capturedPrompts[1]).toContain("jwt.verify()");
    // And plain summary
    expect(capturedPrompts[1]).toContain("3 files changed");
  });
});
