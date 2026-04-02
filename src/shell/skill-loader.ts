import { readFileSync } from "node:fs";
import { join } from "node:path";
import { err, type Result } from "neverthrow";
import type { Skill } from "@core/types";
import { parseSkill } from "@core/skill-schema";

export function loadSkill(skillsDirs: string[], skillName: string): Result<Skill, string> {
  let raw: string | undefined;
  for (const dir of skillsDirs) {
    try {
      raw = readFileSync(join(dir, `${skillName}.md`), "utf-8");
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") return err(`Cannot read skill: ${skillName} — ${(e as Error).message}`);
    }
  }

  if (!raw) {
    return err(`Skill not found: ${skillName} (searched: ${skillsDirs.join(", ")})`);
  }

  return parseSkill(raw, skillName);
}
