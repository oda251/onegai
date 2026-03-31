import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSkill } from "../src/skill-loader";

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

    const skill = loadSkill([tmpDir], "dev/impl");
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

    const skill = loadSkill([tmpDir], "dev/impl");
    expect(skill.frontmatter.inputs.what.type).toBe("evidenced");
    expect(skill.frontmatter.inputs.where.type).toBe("plain");
  });

  it("loads skill with all frontmatter fields", () => {
    writeFileSync(join(tmpDir, "dev/impl.md"), `---
provider: claude
model: sonnet
tools: [Read, Edit]
permission-mode: default
inputs:
  what: Details
---

Work.`);

    const skill = loadSkill([tmpDir], "dev/impl");
    expect(skill.frontmatter.provider).toBe("claude");
    expect(skill.frontmatter.model).toBe("sonnet");
    expect(skill.frontmatter.tools).toEqual(["Read", "Edit"]);
    expect(skill.frontmatter["permission-mode"]).toBe("default");
  });

  it("throws for nonexistent skill", () => {
    expect(() => loadSkill([tmpDir], "dev/nonexistent")).toThrow("Skill not found");
  });

  it("throws for invalid frontmatter", () => {
    writeFileSync(join(tmpDir, "dev/bad.md"), `---
provider: claude
---

No inputs.`);

    expect(() => loadSkill([tmpDir], "dev/bad")).toThrow();
  });

  it("loads skill with empty body", () => {
    writeFileSync(join(tmpDir, "dev/empty.md"), `---
inputs:
  what: Details
---
`);

    const skill = loadSkill([tmpDir], "dev/empty");
    expect(skill.body).toBe("");
  });

  it("preserves markdown body with code blocks", () => {
    writeFileSync(join(tmpDir, "dev/code.md"), `---
inputs:
  what: Details
---

Run the following:

\`\`\`bash
echo hello
\`\`\`

Done.`);

    const skill = loadSkill([tmpDir], "dev/code");
    expect(skill.body).toContain("```bash");
    expect(skill.body).toContain("echo hello");
  });

  it("handles skill without optional fields", () => {
    writeFileSync(join(tmpDir, "dev/minimal.md"), `---
inputs:
  what: Details
---

Work.`);

    const skill = loadSkill([tmpDir], "dev/minimal");
    expect(skill.frontmatter.provider).toBeUndefined();
    expect(skill.frontmatter.model).toBeUndefined();
    expect(skill.frontmatter.tools).toBeUndefined();
    expect(skill.frontmatter["permission-mode"]).toBeUndefined();
  });

  it("throws on invalid input type", () => {
    writeFileSync(join(tmpDir, "dev/badtype.md"), `---
inputs:
  what:
    description: Details
    type: unknown
---

Work.`);

    expect(() => loadSkill([tmpDir], "dev/badtype")).toThrow();
  });

  it("loads skill with many inputs", () => {
    writeFileSync(join(tmpDir, "dev/many.md"), `---
inputs:
  a: First
  b: Second
  c:
    description: Third
    type: plain
  d: Fourth
---

Work.`);

    const skill = loadSkill([tmpDir], "dev/many");
    expect(Object.keys(skill.frontmatter.inputs)).toHaveLength(4);
    expect(skill.frontmatter.inputs.a.type).toBe("evidenced");
    expect(skill.frontmatter.inputs.c.type).toBe("plain");
  });

  it("handles nested domain path", () => {
    mkdirSync(join(tmpDir, "deep/nested"), { recursive: true });
    writeFileSync(join(tmpDir, "deep/nested/skill.md"), `---
inputs:
  x: Value
---

Work.`);

    const skill = loadSkill([tmpDir], "deep/nested/skill");
    expect(skill.domain).toBe("deep");
    expect(skill.name).toBe("nested/skill");
  });

  it("trims body whitespace", () => {
    writeFileSync(join(tmpDir, "dev/ws.md"), `---
inputs:
  x: Value
---

  Work here.

`);

    const skill = loadSkill([tmpDir], "dev/ws");
    expect(skill.body).toBe("Work here.");
  });
});
