import { describe, it, expect } from "bun:test";
import { buildWorkerPrompt } from "../src/prompt-builder.js";
import type { Workflow } from "../src/types.js";

describe("buildWorkerPrompt", () => {
  it("builds prompt with inputs and workflow body", () => {
    const workflow: Workflow = {
      type: "dev/impl",
      domain: "dev",
      name: "impl",
      frontmatter: {
        description: "Implement code",
        inputs: { what: "What to implement", where: "Target file" },
        "confirm-before-run": true,
        next: "review",
        internal: false,
      },
      body: "Write the code following TDD.",
      outputs: { changes: "Changed files" },
    };

    const prompt = buildWorkerPrompt(
      workflow,
      { what: { type: "evidenced", body:"JWT middleware" }, where: { type: "evidenced", body:"src/auth/" } },
      "task-123",
    );

    expect(prompt).toContain("task-123");
    expect(prompt).toContain("JWT middleware");
    expect(prompt).toContain("src/auth/");
    expect(prompt).toContain("Write the code following TDD.");
    expect(prompt).toContain("changes");
    expect(prompt).toContain("done ツール");
    expect(prompt).toContain("reject ツール");
  });

  it("omits outputs section when no then chain", () => {
    const workflow: Workflow = {
      type: "dev/review",
      domain: "dev",
      name: "review",
      frontmatter: {
        description: "Review code",
        inputs: { changes: "Changed files" },
        "confirm-before-run": false,
        internal: true,
      },
      body: "Review the changes.",
      outputs: {},
    };

    const prompt = buildWorkerPrompt(
      workflow,
      { changes: { type: "evidenced", body:"src/auth/middleware.ts" } },
      "task-456",
    );

    expect(prompt).not.toContain("完了時に返す Outputs");
    expect(prompt).toContain("src/auth/middleware.ts");
  });

  it("embeds taskId in done and reject instructions", () => {
    const workflow: Workflow = {
      type: "dev/impl",
      domain: "dev",
      name: "impl",
      frontmatter: {
        description: "Impl",
        inputs: { what: "What" },
        "confirm-before-run": false,
        internal: false,
      },
      body: "Do it.",
      outputs: {},
    };

    const prompt = buildWorkerPrompt(workflow, { what: { type: "evidenced", body:"x" } }, "abc-999");

    // taskId appears in both done and reject instructions
    const doneMatch = prompt.match(/done ツール.*abc-999/);
    const rejectMatch = prompt.match(/reject ツール.*abc-999/);
    expect(doneMatch).not.toBeNull();
    expect(rejectMatch).not.toBeNull();
  });

  it("formats multiple output keys in done hint", () => {
    const workflow: Workflow = {
      type: "dev/impl",
      domain: "dev",
      name: "impl",
      frontmatter: {
        description: "Impl",
        inputs: { what: "What" },
        "confirm-before-run": false,
        next: "review",
        internal: false,
      },
      body: "Do it.",
      outputs: { changes: "Changed files", summary: "Summary of changes" },
    };

    const prompt = buildWorkerPrompt(workflow, { what: { type: "evidenced", body:"x" } }, "task-1");

    expect(prompt).toContain("changes");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("完了時に返す Outputs");
  });

  it("omits output hint in done instruction when no outputs", () => {
    const workflow: Workflow = {
      type: "dev/review",
      domain: "dev",
      name: "review",
      frontmatter: {
        description: "Review",
        inputs: { changes: "Changes" },
        "confirm-before-run": false,
        internal: false,
      },
      body: "Review.",
      outputs: {},
    };

    const prompt = buildWorkerPrompt(
      workflow,
      { changes: { type: "evidenced", body:"file.ts" } },
      "task-2",
    );

    // done instruction should not contain "output:" hint
    expect(prompt).not.toContain("output:");
  });
});
