import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import * as v from "valibot";
import type { Skill, InputSpec } from "./types.js";

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
  "permission-mode": v.optional(v.picklist(["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk"])),
  inputs: v.record(v.string(), InputSpecSchema),
});

function normalizeInputSpec(val: string | { description: string; type: "plain" | "evidenced" }): InputSpec {
  return typeof val === "string" ? { description: val, type: "evidenced" } : val;
}

export function loadSkill(skillsDirs: string[], skillName: string): Skill {
  let resolved: string | undefined;
  for (const dir of skillsDirs) {
    const candidate = join(dir, `${skillName}.md`);
    if (existsSync(candidate)) {
      resolved = candidate;
      break;
    }
  }

  if (!resolved) {
    throw new Error(`Skill not found: ${skillName} (searched: ${skillsDirs.join(", ")})`);
  }

  const raw = readFileSync(resolved, "utf-8");
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
