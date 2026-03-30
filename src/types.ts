export interface WorkflowFrontmatter {
  description: string;
  inputs: Record<string, string>;   // key → description（ワークフロー定義用）
  "confirm-before-run": boolean;
  next?: string;
  internal: boolean;
}

export interface Workflow {
  type: string;
  domain: string;
  name: string;
  frontmatter: WorkflowFrontmatter;
  body: string;
  outputs: Record<string, string>;
}

export type TranscriptCitation = {
  type: "transcript";
  excerpt: string;
};

export type UriCitation = {
  type: "uri";
  source: string;
  excerpt: string;
};

export type Citation = TranscriptCitation | UriCitation;

export interface InputValue {
  body: string;
  citations?: Citation[];
}

export type TaskStatus = "running" | "done" | "rejected";

export interface Task {
  id: string;
  type: string;
  title: string;
  inputs: Record<string, InputValue>;
  status: TaskStatus;
  output?: Record<string, string>;
  reason?: string;
  next?: string;
  chainParent?: string;
  group?: string;
  caller?: string;
}

export interface LintError {
  file: string;
  message: string;
}

export function exhaustive(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
