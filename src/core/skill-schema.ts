import matter from "gray-matter";
import * as v from "valibot";
import { ok, err, type Result } from "neverthrow";
import type { Skill, InputDefinition } from "@core/types";

const InputDefinitionSchema = v.union([
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
  interactive: v.optional(v.boolean()),
  inputs: v.record(v.string(), InputDefinitionSchema),
});

function normalizeInputDefinition(val: string | { description: string; type: "plain" | "evidenced" }): InputDefinition {
  return typeof val === "string" ? { description: val, type: "evidenced" } : val;
}

export function parseSkill(raw: string, skillName: string): Result<Skill, string> {
  let data: Record<string, unknown>;
  let content: string;
  try {
    ({ data, content } = matter(raw));
  } catch (e) {
    return err(`Invalid skill frontmatter: ${skillName} — ${(e as Error).message}`);
  }

  let parsed: v.InferOutput<typeof SkillFrontmatterSchema>;
  try {
    parsed = v.parse(SkillFrontmatterSchema, data);
  } catch (e) {
    return err(`Invalid skill schema: ${skillName} — ${(e as Error).message}`);
  }

  const inputs: Record<string, InputDefinition> = {};
  for (const [key, val] of Object.entries(parsed.inputs)) {
    inputs[key] = normalizeInputDefinition(val);
  }

  const slashIdx = skillName.indexOf("/");
  const domain = slashIdx >= 0 ? skillName.slice(0, slashIdx) : "";
  const name = slashIdx >= 0 ? skillName.slice(slashIdx + 1) : skillName;

  return ok({
    name,
    domain,
    frontmatter: { ...parsed, inputs },
    body: content.trim(),
  });
}
