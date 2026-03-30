import { readFileSync, readdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import matter from "gray-matter";
import * as v from "valibot";
import type { Workflow, LintError } from "./types.js";

const FrontmatterSchema = v.object({
  description: v.pipe(v.string(), v.minLength(1)),
  inputs: v.record(v.string(), v.string()),
  "confirm-before-run": v.optional(v.boolean(), false),
  next: v.optional(v.string()),
  internal: v.optional(v.boolean(), false),
});

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
  const files = discoverWorkflowFiles(workflowsDir);

  for (const filePath of files) {
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

    const { data, content } = matter(raw);
    const result = v.safeParse(FrontmatterSchema, data);

    if (!result.success) {
      const issues = result.issues.map((i) => i.message).join("; ");
      errors.push({
        file: type,
        message: `Invalid frontmatter: ${issues}`,
      });
      continue;
    }

    workflows.set(type, {
      type,
      domain,
      name,
      frontmatter: result.output,
      body: content.trim(),
      outputs: {},
    });
  }

  // Resolve next references and outputs
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
    for (const [key, desc] of Object.entries(nextWorkflow.frontmatter.inputs)) {
      if (!currentInputKeys.has(key)) {
        workflow.outputs[key] = desc;
      }
    }
  }

  return { workflows, errors };
}

export function lint(workflowsDir: string): LintError[] {
  const { workflows, errors } = loadWorkflows(workflowsDir);

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
