import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import * as v from "valibot";
import type { Skill, InputSpec } from "./types.js";
import { findRepoRoot } from "./paths.js";

const InputSpecSchema = v.union([
  v.string(),
  v.object({
    description: v.string(),
    type: v.picklist(["plain", "evidenced"]),
  }),
]);

const SkillFrontmatterSchema = v.object({
  provider: v.optional(v.string()),
  model: v.optional(v.string()),
  tools: v.optional(v.array(v.string())),
  "permission-mode": v.optional(v.string()),
  inputs: v.record(v.string(), InputSpecSchema),
});

function normalizeInputSpec(val: string | { description: string; type: "plain" | "evidenced" }): InputSpec {
  return typeof val === "string" ? { description: val, type: "evidenced" } : val;
}

export function resolveSkillsDirs(cwd: string): string[] {
  const candidates = [
    join(cwd, ".claude", "skills"),                       // project local
    join(findRepoRoot(cwd) ?? "", ".claude", "skills"),   // repo root
    join(process.env.HOME ?? "", ".claude", "skills"),    // user global
  ];
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const dir of candidates) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    if (existsSync(dir)) dirs.push(dir);
  }
  return dirs;
}


export function loadSkill(skillsDirs: string | string[], skillName: string): Skill {
  const dirs = Array.isArray(skillsDirs) ? skillsDirs : [skillsDirs];
  let resolved: string | undefined;

  for (const dir of dirs) {
    const candidate = join(dir, `${skillName}.md`);
    if (existsSync(candidate)) {
      resolved = candidate;
      break;
    }
  }

  if (!resolved) {
    throw new Error(`Skill not found: ${skillName} (searched: ${dirs.join(", ")})`);
  }

  const path = resolved;

  const raw = readFileSync(path, "utf-8");
  const { data, content } = matter(raw);
  const parsed = v.parse(SkillFrontmatterSchema, data);

  const inputs: Record<string, InputSpec> = {};
  for (const [key, val] of Object.entries(parsed.inputs)) {
    inputs[key] = normalizeInputSpec(val);
  }

  const domain = skillName.includes("/") ? skillName.split("/")[0] : "";
  const name = skillName.includes("/") ? skillName.split("/").slice(1).join("/") : skillName;

  return {
    name,
    domain,
    frontmatter: { ...parsed, inputs },
    body: content.trim(),
  };
}
