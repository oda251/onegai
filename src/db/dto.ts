import * as v from "valibot";
import { createSelectSchema } from "drizzle-valibot";
import { tasks } from "./schema.js";

// --- Base: derived from DB schema ---

const taskSchema = createSelectSchema(tasks);

// --- Shared field schemas ---

const nonEmptyString = v.pipe(v.string(), v.minLength(1));

export const CitationSchema = v.union([
  v.object({ type: v.literal("transcript"), excerpt: v.string() }),
  v.object({ type: v.literal("uri"), source: v.string(), excerpt: v.string() }),
]);

export const InputValueSchema = v.object({
  body: nonEmptyString,
  citations: v.optional(v.array(CitationSchema)),
});

const ChainStepSchema = v.object({
  taskId: v.string(),
  status: v.literal("running"),
  type: v.string(),
  prompt: v.string(),
});

// --- MCP Tool Input DTOs ---

export const RunArgsSchema = v.object({
  type: nonEmptyString,
  title: nonEmptyString,
  inputs: v.record(v.string(), InputValueSchema),
  group: v.optional(v.string()),
});

export const DoneArgsSchema = v.object({
  taskId: nonEmptyString,
  output: v.record(v.string(), v.string()),
});

export const RejectArgsSchema = v.object({
  taskId: nonEmptyString,
  reason: nonEmptyString,
});

export const StatusArgsSchema = v.object({
  taskId: v.optional(v.string()),
});

export const RegisterTranscriptArgsSchema = v.object({
  path: nonEmptyString,
});

// --- MCP Tool Output DTOs (pick from DB schema + extend) ---

export const TaskRefSchema = v.object({
  taskId: taskSchema.entries.id,
  title: taskSchema.entries.title,
});

export const RunResponseSchema = v.object({
  ...TaskRefSchema.entries,
  status: v.literal("running"),
  prompt: v.string(),
});

export const DoneResponseSchema = v.object({
  ...TaskRefSchema.entries,
  status: v.literal("done"),
  output: v.record(v.string(), v.string()),
  next: v.optional(ChainStepSchema),
});

export const RejectResponseSchema = v.object({
  ...TaskRefSchema.entries,
  status: v.literal("rejected"),
  reason: v.string(),
});

// --- Notification DTOs ---

export const TaskDoneNotificationSchema = v.object({
  taskId: taskSchema.entries.id,
  title: taskSchema.entries.title,
  output: v.record(v.string(), v.string()),
});

export const TaskRejectedNotificationSchema = v.object({
  taskId: taskSchema.entries.id,
  title: taskSchema.entries.title,
  reason: v.string(),
});

const GroupTaskSummarySchema = v.object({
  taskId: v.string(),
  title: v.string(),
  status: v.string(),
});

export const GroupDoneNotificationSchema = v.object({
  group: v.string(),
  tasks: v.array(GroupTaskSummarySchema),
});

// --- Inferred types ---

export type RunArgs = v.InferOutput<typeof RunArgsSchema>;
export type DoneArgs = v.InferOutput<typeof DoneArgsSchema>;
export type RejectArgs = v.InferOutput<typeof RejectArgsSchema>;
export type StatusArgs = v.InferOutput<typeof StatusArgsSchema>;
export type RunResponse = v.InferOutput<typeof RunResponseSchema>;
export type DoneResponse = v.InferOutput<typeof DoneResponseSchema>;
export type RejectResponse = v.InferOutput<typeof RejectResponseSchema>;
export type TaskDoneNotification = v.InferOutput<typeof TaskDoneNotificationSchema>;
export type TaskRejectedNotification = v.InferOutput<typeof TaskRejectedNotificationSchema>;
export type GroupDoneNotification = v.InferOutput<typeof GroupDoneNotificationSchema>;
