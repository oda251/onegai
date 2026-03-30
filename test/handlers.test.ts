import { describe, it, expect } from "bun:test";
import { TaskStore } from "../src/task-store.js";
import {
  listWorkflows,
  runWorkflow,
  completeTask,
  rejectTask,
  getStatus,
} from "../src/handlers.js";
import type { Workflow } from "../src/types.js";

function makeWorkflows(): Map<string, Workflow> {
  const map = new Map<string, Workflow>();
  map.set("dev/impl", {
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
    body: "Write the code.",
    outputs: { changes: "Changed files" },
  });
  map.set("dev/review", {
    type: "dev/review",
    domain: "dev",
    name: "review",
    frontmatter: {
      description: "Review implementation",
      inputs: { changes: "Changed files" },
      "confirm-before-run": false,
      internal: true,
    },
    body: "Review the changes.",
    outputs: {},
  });
  map.set("research/gather", {
    type: "research/gather",
    domain: "research",
    name: "gather",
    frontmatter: {
      description: "Gather information",
      inputs: { topic: "Research topic" },
      "confirm-before-run": false,
      internal: false,
    },
    body: "Research the topic.",
    outputs: {},
  });
  return map;
}

describe("listWorkflows", () => {
  it("returns only runnable workflows with summary", () => {
    const result = listWorkflows(makeWorkflows());
    expect(result).toHaveLength(2);
    const types = result.map((w) => w.type);
    expect(types).toContain("dev/impl");
    expect(types).toContain("research/gather");
    expect(types).not.toContain("dev/review");
  });

  it("includes confirm-before-run field", () => {
    const result = listWorkflows(makeWorkflows());
    const impl = result.find((w) => w.type === "dev/impl");
    expect(impl?.["confirm-before-run"]).toBe(true);
    const gather = result.find((w) => w.type === "research/gather");
    expect(gather?.["confirm-before-run"]).toBe(false);
  });

  it("returns empty array when no workflows", () => {
    const result = listWorkflows(new Map());
    expect(result).toEqual([]);
  });
});

describe("runWorkflow", () => {
  it("creates task and returns prompt", () => {
    const store = new TaskStore();
    const result = runWorkflow(makeWorkflows(), store, {
      type: "dev/impl",
      title: "Add auth",
      inputs: { what: { body: "JWT" }, where: { body: "src/" } },
    });

    expect(result.isOk()).toBe(true);
    const data = result._unsafeUnwrap();
    expect(data.status).toBe("running");
    expect(data.prompt).toContain("JWT");
    expect(data.taskId).toBeDefined();
  });

  it("errors on unknown workflow type", () => {
    const store = new TaskStore();
    const result = runWorkflow(makeWorkflows(), store, {
      type: "unknown/type",
      title: "Test",
      inputs: {},
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("Unknown workflow type");
  });

  it("errors on internal workflow", () => {
    const store = new TaskStore();
    const result = runWorkflow(makeWorkflows(), store, {
      type: "dev/review",
      title: "Test",
      inputs: { changes: { body: "file.ts" } },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("internal");
  });

  it("errors on missing required inputs", () => {
    const store = new TaskStore();
    const result = runWorkflow(makeWorkflows(), store, {
      type: "dev/impl",
      title: "Test",
      inputs: { what: { body: "something" } },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("where");
  });

  it("errors on empty string input value", () => {
    const store = new TaskStore();
    const result = runWorkflow(makeWorkflows(), store, {
      type: "dev/impl",
      title: "Test",
      inputs: { what: { body: "something" }, where: { body: "" } },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("where");
  });
});

describe("completeTask", () => {
  it("completes a task without next chain", () => {
    const workflows = makeWorkflows();
    const store = new TaskStore();
    const run = runWorkflow(workflows, store, {
      type: "research/gather",
      title: "Research",
      inputs: { topic: { body: "JWT" } },
    });
    const { taskId } = run._unsafeUnwrap();

    const result = completeTask(workflows, store, {
      taskId,
      output: { summary: "JWT is good" },
    });

    expect(result.isOk()).toBe(true);
    const data = result._unsafeUnwrap();
    expect(data.status).toBe("done");
    expect(data.output).toEqual({ summary: "JWT is good" });
    expect(data.next).toBeUndefined();
  });

  it("auto-starts next step on completion", () => {
    const workflows = makeWorkflows();
    const store = new TaskStore();
    const run = runWorkflow(workflows, store, {
      type: "dev/impl",
      title: "Add auth",
      inputs: { what: { body: "auth" }, where: { body: "src/" } },
    });
    const { taskId } = run._unsafeUnwrap();

    const result = completeTask(workflows, store, {
      taskId,
      output: { changes: "modified src/auth.ts" },
    });

    expect(result.isOk()).toBe(true);
    const data = result._unsafeUnwrap();
    expect(data.status).toBe("done");
    const next = data.next;
    expect(next).toBeDefined();
    expect(next?.type).toBe("dev/review");
    expect(next?.status).toBe("running");
    expect(next?.prompt).toContain("modified src/auth.ts");

    // Verify next task in store
    const nextTask = next ? store.get(next.taskId) : undefined;
    expect(nextTask).toBeDefined();
    expect(nextTask?.type).toBe("dev/review");
    expect(nextTask?.chainParent).toBe(taskId);
    expect(nextTask?.inputs).toEqual({ changes: { body: "modified src/auth.ts" } });
  });

  it("rejects done with missing required outputs", () => {
    const workflows = makeWorkflows();
    const store = new TaskStore();
    const run = runWorkflow(workflows, store, {
      type: "dev/impl",
      title: "Add auth",
      inputs: { what: { body: "auth" }, where: { body: "src/" } },
    });
    const { taskId } = run._unsafeUnwrap();

    const result = completeTask(workflows, store, {
      taskId,
      output: {},
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("Missing required outputs");
    expect(result._unsafeUnwrapErr()).toContain("changes");

    // Task should still be running
    expect(store.get(taskId)?.status).toBe("running");
  });

  it("rejects done with empty output value", () => {
    const workflows = makeWorkflows();
    const store = new TaskStore();
    const run = runWorkflow(workflows, store, {
      type: "dev/impl",
      title: "Test",
      inputs: { what: { body: "auth" }, where: { body: "src/" } },
    });
    const { taskId } = run._unsafeUnwrap();

    const result = completeTask(workflows, store, {
      taskId,
      output: { changes: "" },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("Missing required outputs");
  });

  it("does not validate outputs when no next chain", () => {
    const workflows = makeWorkflows();
    const store = new TaskStore();
    const run = runWorkflow(workflows, store, {
      type: "research/gather",
      title: "Research",
      inputs: { topic: { body: "JWT" } },
    });
    const { taskId } = run._unsafeUnwrap();

    // Empty output is fine when there's no next chain
    const result = completeTask(workflows, store, {
      taskId,
      output: {},
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe("done");
  });

  it("errors on already-completed task", () => {
    const workflows = makeWorkflows();
    const store = new TaskStore();
    const run = runWorkflow(workflows, store, {
      type: "research/gather",
      title: "T",
      inputs: { topic: { body: "test" } },
    });
    const { taskId } = run._unsafeUnwrap();
    completeTask(workflows, store, { taskId, output: {} });

    const result = completeTask(workflows, store, { taskId, output: {} });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("not running");
  });

  it("errors on nonexistent task", () => {
    const workflows = makeWorkflows();
    const store = new TaskStore();
    const result = completeTask(workflows, store, {
      taskId: "no-such-id",
      output: {},
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("not found");
  });
});

describe("rejectTask", () => {
  it("rejects a running task", () => {
    const store = new TaskStore();
    const task = store.create({ type: "dev/impl", title: "T", inputs: {} });

    const result = rejectTask(store, {
      taskId: task.id,
      reason: "Bad spec",
    });

    expect(result.isOk()).toBe(true);
    const data = result._unsafeUnwrap();
    expect(data.status).toBe("rejected");
    expect(data.reason).toBe("Bad spec");
  });

  it("errors on already-done task", () => {
    const store = new TaskStore();
    const task = store.create({ type: "dev/impl", title: "T", inputs: {} });
    store.complete(task.id, {});

    const result = rejectTask(store, {
      taskId: task.id,
      reason: "Too late",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("not running");
  });

  it("errors on nonexistent task", () => {
    const store = new TaskStore();
    const result = rejectTask(store, {
      taskId: "no-such-id",
      reason: "whatever",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("not found");
  });
});

describe("getStatus", () => {
  it("returns all tasks when no taskId", () => {
    const store = new TaskStore();
    store.create({ type: "dev/impl", title: "A", inputs: {} });
    store.create({ type: "dev/impl", title: "B", inputs: {} });

    const result = getStatus(store);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toHaveLength(2);
  });

  it("returns empty array when no tasks", () => {
    const store = new TaskStore();
    const result = getStatus(store);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it("returns specific task by id", () => {
    const store = new TaskStore();
    const task = store.create({ type: "dev/impl", title: "A", inputs: {} });

    const result = getStatus(store, task.id);
    expect(result.isOk()).toBe(true);
    const data = result._unsafeUnwrap();
    expect((data as { id: string }).id).toBe(task.id);
  });

  it("errors on unknown task id", () => {
    const store = new TaskStore();
    const result = getStatus(store, "nonexistent");
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("not found");
  });
});

describe("concurrent tasks", () => {
  it("handles multiple running tasks independently", () => {
    const workflows = makeWorkflows();
    const store = new TaskStore();

    const run1 = runWorkflow(workflows, store, {
      type: "research/gather",
      title: "Research A",
      inputs: { topic: { body: "A" } },
    })._unsafeUnwrap();

    const run2 = runWorkflow(workflows, store, {
      type: "research/gather",
      title: "Research B",
      inputs: { topic: { body: "B" } },
    })._unsafeUnwrap();

    // Complete first, reject second
    completeTask(workflows, store, { taskId: run1.taskId, output: { result: "done A" } });
    rejectTask(store, { taskId: run2.taskId, reason: "bad topic" });

    expect(store.get(run1.taskId)?.status).toBe("done");
    expect(store.get(run2.taskId)?.status).toBe("rejected");
    expect(store.getRunning()).toHaveLength(0);
  });
});
