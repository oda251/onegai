import { nanoid } from "nanoid";
import { ok, err, type Result } from "neverthrow";
import type { Task, InputValue } from "./types.js";

export class TaskStore {
  private tasks = new Map<string, Task>();
  private groupIndex = new Map<string, Set<string>>();

  create(params: {
    type: string;
    title: string;
    inputs: Record<string, InputValue>;
    next?: string;
    chainParent?: string;
    group?: string;
    caller?: string;
  }): Task {
    const task: Task = {
      id: nanoid(12),
      type: params.type,
      title: params.title,
      inputs: params.inputs,
      status: "running",
      next: params.next,
      chainParent: params.chainParent,
      group: params.group,
      caller: params.caller,
    };
    this.tasks.set(task.id, task);
    if (task.group) {
      let ids = this.groupIndex.get(task.group);
      if (!ids) {
        ids = new Set();
        this.groupIndex.set(task.group, ids);
      }
      ids.add(task.id);
    }
    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  complete(id: string, output: Record<string, string>): Result<Task, string> {
    return this.ensureRunning(id).map((task) => {
      task.status = "done";
      task.output = output;
      return task;
    });
  }

  reject(id: string, reason: string): Result<Task, string> {
    return this.ensureRunning(id).map((task) => {
      task.status = "rejected";
      task.reason = reason;
      return task;
    });
  }

  list(): Task[] {
    return [...this.tasks.values()];
  }

  getRunning(): Task[] {
    const result: Task[] = [];
    for (const t of this.tasks.values()) {
      if (t.status === "running") result.push(t);
    }
    return result;
  }

  getByGroup(groupId: string): Task[] {
    const ids = this.groupIndex.get(groupId);
    if (!ids) return [];
    const result: Task[] = [];
    for (const id of ids) {
      const task = this.tasks.get(id);
      if (task) result.push(task);
    }
    return result;
  }

  private ensureRunning(id: string): Result<Task, string> {
    const task = this.tasks.get(id);
    if (!task) return err(`Task not found: ${id}`);
    if (task.status !== "running")
      return err(`Task ${id} is not running (status: ${task.status})`);
    return ok(task);
  }
}
