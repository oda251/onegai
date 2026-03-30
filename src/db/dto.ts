import * as v from "valibot";

export const TaskRefSchema = v.object({
  taskId: v.string(),
  title: v.string(),
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
  next: v.optional(v.object({
    taskId: v.string(),
    status: v.literal("running"),
    type: v.string(),
    prompt: v.string(),
  })),
});

export const RejectResponseSchema = v.object({
  ...TaskRefSchema.entries,
  status: v.literal("rejected"),
  reason: v.string(),
});

export type TaskRef = v.InferOutput<typeof TaskRefSchema>;
export type RunResponse = v.InferOutput<typeof RunResponseSchema>;
export type DoneResponse = v.InferOutput<typeof DoneResponseSchema>;
export type RejectResponse = v.InferOutput<typeof RejectResponseSchema>;
