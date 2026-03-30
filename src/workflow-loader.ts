import { readFileSync, readdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import matter from "gray-matter";
import * as v from "valibot";
import type { Workflow, LintError } from "./types.js";

// --- Core: pure parsing and validation ---

const InputSpecSchema = v.union([
  v.string(),
  v.object({
    description: v.string(),
    type: v.picklist(["plain", "evidenced"]),
  }),
]);

const RawFrontmatterSchema = v.object({
  description: v.pipe(v.string(), v.minLength(1)),
  inputs: v.record(v.string(), InputSpecSchema),
  "confirm-before-run": v.optional(v.boolean(), false),
  next: v.optional(v.string()),
  internal: v.optional(v.boolean(), false),
  tools: v.optional(v.array(v.string())),
  "permission-mode": v.optional(v.string()),
});

function normalizeInputs(
  raw: Record<string, string | { description: string; type: "plain" | "evidenced" }>,
): Record<string, { description: string; type: "plain" | "evidenced" }> {
  const result: Record<string, { description: string; type: "plain" | "evidenced" }> = {};
  for (const [key, val] of Object.entries(raw)) {
    result[key] = typeof val === "string"
      ? { description: val, type: "evidenced" }
      : val;
  }
  return result;
}

export function parseWorkflow(
  type: string,
  domain: string,
  name: string,
  raw: string,
): { workflow: Workflow } | { error: LintError } {
  const { data, content } = matter(raw);
  const result = v.safeParse(RawFrontmatterSchema, data);

  if (!result.success) {
    const issues = result.issues.map((i) => i.message).join("; ");
    return { error: { file: type, message: `Invalid frontmatter: ${issues}` } };
  }

  return {
    workflow: {
      type,
      domain,
      name,
      frontmatter: { ...result.output, inputs: normalizeInputs(result.output.inputs) },
      body: content.trim(),
      outputs: {},
    },
  };
}

export function resolveOutputs(
  workflows: Map<string, Workflow>,
): LintError[] {
  const errors: LintError[] = [];

  for (const [type, workflow] of workflows) {
    const { next: nextName } = workflow.frontmatter;
    if (!nextName) continue;

    const nextType = `${workflow.domain}/${nextName}`;
    const nextWorkflow = workflows.get(nextType);

    if (!nextWorkflow) {
      errors.push({
        file: type,
        message: `next "${nextName}" references non-existent workflow "${nextType}"`,
      });
      continue;
    }

    const currentInputKeys = new Set(
      Object.keys(workflow.frontmatter.inputs),
    );
    for (const [key, spec] of Object.entries(nextWorkflow.frontmatter.inputs)) {
      if (!currentInputKeys.has(key)) {
        workflow.outputs[key] = spec.description;
      }
    }
  }

  return errors;
}

export function lintWorkflows(workflows: Map<string, Workflow>): LintError[] {
  const errors: LintError[] = [];

  // Circular chains
  for (const [type, workflow] of workflows) {
    if (!workflow.frontmatter.next) continue;

    const visited = new Set<string>();
    let current: string | undefined = type;

    while (current) {
      if (visited.has(current)) {
        errors.push({
          file: type,
          message: `Circular chain detected: ${[...visited, current].join(" → ")}`,
        });
        break;
      }
      visited.add(current);
      const w = workflows.get(current);
      if (!w?.frontmatter.next) break;
      current = `${w.domain}/${w.frontmatter.next}`;
    }
  }

  // Orphaned internal workflows
  const referencedByNext = new Set<string>();
  for (const [, workflow] of workflows) {
    if (workflow.frontmatter.next) {
      referencedByNext.add(`${workflow.domain}/${workflow.frontmatter.next}`);
    }
  }

  for (const [type, workflow] of workflows) {
    if (workflow.frontmatter.internal && !referencedByNext.has(type)) {
      errors.push({
        file: type,
        message:
          "Workflow is internal but not referenced by any next chain (orphaned)",
      });
    }
  }

  return errors;
}

export function getRunnableWorkflows(
  workflows: Map<string, Workflow>,
): Workflow[] {
  return [...workflows.values()].filter(
    (w) => !w.frontmatter.internal,
  );
}

// --- Shell: file I/O ---

function discoverWorkflowFiles(workflowsDir: string): string[] {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(workflowsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const domain of entries) {
    if (!domain.isDirectory()) continue;
    const domainDir = join(workflowsDir, domain.name);
    for (const file of readdirSync(domainDir, { withFileTypes: true })) {
      if (file.isFile() && file.name.endsWith(".md")) {
        files.push(join(domainDir, file.name));
      }
    }
  }
  return files;
}

export function loadWorkflows(workflowsDir: string): {
  workflows: Map<string, Workflow>;
  errors: LintError[];
} {
  const workflows = new Map<string, Workflow>();
  const errors: LintError[] = [];

  for (const filePath of discoverWorkflowFiles(workflowsDir)) {
    const domain = basename(dirname(filePath));
    const name = basename(filePath, ".md");
    const type = `${domain}/${name}`;

    let raw: string;
    try {
      raw = readFileSync(filePath, "utf-8");
    } catch {
      errors.push({ file: type, message: "Failed to read file" });
      continue;
    }

    const result = parseWorkflow(type, domain, name, raw);
    if ("error" in result) {
      errors.push(result.error);
    } else {
      workflows.set(type, result.workflow);
    }
  }

  errors.push(...resolveOutputs(workflows));
  return { workflows, errors };
}

export function lint(workflowsDir: string): LintError[] {
  const { workflows, errors } = loadWorkflows(workflowsDir);
  errors.push(...lintWorkflows(workflows));
  return errors;
}
