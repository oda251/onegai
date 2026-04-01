// --- Citation ---

export interface TranscriptCitation {
  type: "transcript";
  excerpt: string;
}

export interface UriCitation {
  type: "uri";
  source: string;
  excerpt: string;
}

export interface CommandCitation {
  type: "command";
  command: string;
  excerpt: string;
}

export type Citation = TranscriptCitation | UriCitation | CommandCitation;

// --- Input ---

export interface PlainInput {
  type: "plain";
  value: string;
}

export interface EvidencedInput {
  type: "evidenced";
  body: string;
  citations: Citation[];
}

export type InputEntry = PlainInput | EvidencedInput;

export type InputType = "plain" | "evidenced";

export type CallerMode = "human" | "agent";

export interface InputSpec {
  description: string;
  type: InputType;
}

// --- Skill ---

export interface SkillFrontmatter {
  provider?: string;
  model?: string;
  tools?: string[];
  "permission-mode"?: string;
  inputs: Record<string, InputSpec>;
}

export interface Skill {
  name: string;
  domain: string;
  frontmatter: SkillFrontmatter;
  body: string;
}

// --- Workflow ---

export interface SkillStep {
  type: "skill";
  skill: string;
  id?: string;
  inputs?: Record<string, string>;
}

export interface RunStep {
  type: "run";
  run: string;
  id?: string;
}

export type Step = SkillStep | RunStep;

export interface Job {
  id: string;
  needs: string[];
  steps: Step[];
}

export interface Workflow {
  name: string;
  jobs: Record<string, Job>;
}

// --- Run Store ---

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";
export type JobStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface StepResult {
  id?: string;
  type: "skill" | "run";
  status: StepStatus;
  outputs: Record<string, InputEntry>;
  error?: string;
}

export interface JobResult {
  id: string;
  status: JobStatus;
  steps: StepResult[];
}

export interface RunResult {
  id: string;
  workflow: string;
  status: "running" | "done" | "failed";
  jobs: Record<string, JobResult>;
  startedAt: string;
  finishedAt?: string;
}

// --- Utility ---

export function exhaustive(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
