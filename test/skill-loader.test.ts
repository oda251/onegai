import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSkill } from "../src/skill-loader.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sidekick-skill-test-"));
  mkdirSync(join(tmpDir, "dev"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadSkill", () => {
  it("loads skill with shorthand inputs", () => {
    writeFileSync(join(tmpDir, "dev/impl.md"), `---
inputs:
  what: Implementation details
  where: Target file
---

Do the work.`);

    const skill = loadSkill(tmpDir, "dev/impl");
    expect(skill.name).toBe("impl");
    expect(skill.domain).toBe("dev");
    expect(skill.frontmatter.inputs.what).toEqual({ description: "Implementation details", type: "evidenced" });
    expect(skill.frontmatter.inputs.where).toEqual({ description: "Target file", type: "evidenced" });
    expect(skill.body).toBe("Do the work.");
  });

  it("loads skill with typed inputs", () => {
    writeFileSync(join(tmpDir, "dev/impl.md"), `---
inputs:
  what: Implementation details
  where:
    description: Target file
    type: plain
---

Do it.`);

    const skill = loadSkill(tmpDir, "dev/impl");
    expect(skill.frontmatter.inputs.what.type).toBe("evidenced");
    expect(skill.frontmatter.inputs.where.type).toBe("plain");
  });

  it("loads skill with all frontmatter fields", () => {
    writeFileSync(join(tmpDir, "dev/impl.md"), `---
provider: claude
model: sonnet
tools: [Read, Edit]
permission-mode: auto
inputs:
  what: Details
---

Work.`);

    const skill = loadSkill(tmpDir, "dev/impl");
    expect(skill.frontmatter.provider).toBe("claude");
    expect(skill.frontmatter.model).toBe("sonnet");
    expect(skill.frontmatter.tools).toEqual(["Read", "Edit"]);
    expect(skill.frontmatter["permission-mode"]).toBe("auto");
  });

  it("throws for nonexistent skill", () => {
    expect(() => loadSkill(tmpDir, "dev/nonexistent")).toThrow("Skill not found");
  });

  it("throws for invalid frontmatter", () => {
    writeFileSync(join(tmpDir, "dev/bad.md"), `---
provider: claude
---

No inputs.`);

    expect(() => loadSkill(tmpDir, "dev/bad")).toThrow();
  });
});
