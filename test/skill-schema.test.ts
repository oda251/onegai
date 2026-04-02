import { describe, it, expect } from "bun:test";
import { parseSkill } from "@core/skill-schema";

function unwrap(raw: string, name = "dev/impl") {
  const result = parseSkill(raw, name);
  if (result.isErr()) throw new Error(result.error);
  return result.value;
}

describe("parseSkill", () => {
  it("parses shorthand inputs as evidenced", () => {
    const skill = unwrap(`---
inputs:
  what: Implementation details
  where: Target file
---

Do the work.`);
    expect(skill.frontmatter.inputs.what).toEqual({ description: "Implementation details", type: "evidenced" });
    expect(skill.frontmatter.inputs.where).toEqual({ description: "Target file", type: "evidenced" });
  });

  it("parses typed inputs", () => {
    const skill = unwrap(`---
inputs:
  what: Implementation details
  where:
    description: Target file
    type: plain
---

Work.`);
    expect(skill.frontmatter.inputs.what.type).toBe("evidenced");
    expect(skill.frontmatter.inputs.where.type).toBe("plain");
  });

  it("parses all frontmatter fields", () => {
    const skill = unwrap(`---
provider: claude
model: sonnet
tools: [Read, Edit]
permission-mode: default
interactive: true
inputs:
  what: Details
---

Work.`);
    expect(skill.frontmatter.provider).toBe("claude");
    expect(skill.frontmatter.model).toBe("sonnet");
    expect(skill.frontmatter.tools).toEqual(["Read", "Edit"]);
    expect(skill.frontmatter["permission-mode"]).toBe("default");
    expect(skill.frontmatter.interactive).toBe(true);
  });

  it("defaults optional fields to undefined", () => {
    const skill = unwrap(`---
inputs:
  what: Details
---

Work.`);
    expect(skill.frontmatter.provider).toBeUndefined();
    expect(skill.frontmatter.model).toBeUndefined();
    expect(skill.frontmatter.tools).toBeUndefined();
    expect(skill.frontmatter["permission-mode"]).toBeUndefined();
    expect(skill.frontmatter.interactive).toBeUndefined();
  });

  it("extracts domain and name from qualified name", () => {
    const skill = unwrap(`---
inputs:
  what: Details
---

Work.`, "dev/impl");
    expect(skill.domain).toBe("dev");
    expect(skill.name).toBe("impl");
  });

  it("handles nested domain path", () => {
    const skill = unwrap(`---
inputs:
  what: Details
---

Work.`, "deep/nested/skill");
    expect(skill.domain).toBe("deep");
    expect(skill.name).toBe("nested/skill");
  });

  it("handles unqualified name", () => {
    const skill = unwrap(`---
inputs:
  what: Details
---

Work.`, "simple");
    expect(skill.domain).toBe("");
    expect(skill.name).toBe("simple");
  });

  it("trims body whitespace", () => {
    const skill = unwrap(`---
inputs:
  what: Details
---

  Work here.

`);
    expect(skill.body).toBe("Work here.");
  });

  it("preserves markdown body with code blocks", () => {
    const skill = unwrap(`---
inputs:
  what: Details
---

Run:

\`\`\`bash
echo hello
\`\`\`

Done.`);
    expect(skill.body).toContain("```bash");
    expect(skill.body).toContain("echo hello");
  });

  it("returns error for missing inputs", () => {
    const result = parseSkill(`---
provider: claude
---

No inputs.`, "dev/bad");
    expect(result.isErr()).toBe(true);
  });

  it("returns error for invalid input type", () => {
    const result = parseSkill(`---
inputs:
  what:
    description: Details
    type: unknown
---

Work.`, "dev/bad");
    expect(result.isErr()).toBe(true);
  });

  it("returns error for invalid frontmatter", () => {
    const result = parseSkill("not yaml frontmatter", "dev/bad");
    expect(result.isErr()).toBe(true);
  });

  it("handles empty body", () => {
    const skill = unwrap(`---
inputs:
  what: Details
---
`);
    expect(skill.body).toBe("");
  });

  it("parses many inputs", () => {
    const skill = unwrap(`---
inputs:
  a: First
  b: Second
  c:
    description: Third
    type: plain
  d: Fourth
---

Work.`);
    expect(Object.keys(skill.frontmatter.inputs)).toHaveLength(4);
    expect(skill.frontmatter.inputs.a.type).toBe("evidenced");
    expect(skill.frontmatter.inputs.c.type).toBe("plain");
  });
});
