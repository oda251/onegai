import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { loadSkill } from "@shell/skill-loader";
import { createTestDir, createSkill, type TestDir } from "./helpers";

let t: TestDir;

beforeEach(() => { t = createTestDir("skill"); });
afterEach(() => { t.cleanup(); });

describe("loadSkill (file resolution)", () => {
  it("finds skill in first directory", () => {
    createSkill(t.skillsDir, "dev/impl");
    const result = loadSkill([t.skillsDir], "dev/impl");
    expect(result.isOk()).toBe(true);
  });

  it("searches multiple directories", () => {
    const { skillsDir: altSkills, cleanup } = createTestDir("skill-alt");
    createSkill(altSkills, "dev/impl");
    const result = loadSkill([t.skillsDir, altSkills], "dev/impl");
    expect(result.isOk()).toBe(true);
    cleanup();
  });

  it("returns error for nonexistent skill", () => {
    const result = loadSkill([t.skillsDir], "dev/nonexistent");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toContain("Skill not found");
  });

  it("returns error for non-ENOENT read failure", () => {
    const result = loadSkill(["/dev/null"], "dev/impl");
    expect(result.isErr()).toBe(true);
  });

  it("delegates parsing to core (smoke test)", () => {
    createSkill(t.skillsDir, "dev/impl", {
      inputs: { what: "Details", where: { description: "File", type: "plain" } },
      model: "sonnet",
    });
    const result = loadSkill([t.skillsDir], "dev/impl");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.frontmatter.inputs.what.type).toBe("evidenced");
      expect(result.value.frontmatter.inputs.where.type).toBe("plain");
      expect(result.value.frontmatter.model).toBe("sonnet");
    }
  });
});
