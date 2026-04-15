import { describe, it, expect } from "bun:test";
import { buildWorkerPrompt, formatInputs, buildInteractiveLaunchPrompt, OUTPUT_FORMAT_SPEC } from "@core/prompts";
import { parseGithubOutputContent } from "@core/output-format";
import type { InputValue } from "@core/types";

describe("buildWorkerPrompt", () => {
  it("includes inputs section", () => {
    const inputs: Record<string, InputValue> = {
      what: { type: "plain", value: "add auth" },
    };
    const prompt = buildWorkerPrompt("Do the work.", inputs, []);
    expect(prompt).toContain("### Inputs");
    expect(prompt).toContain("**what**: add auth");
  });

  it("includes outputs section when provided", () => {
    const prompt = buildWorkerPrompt("Work.", {}, ["changes", "summary"]);
    expect(prompt).toContain("### Outputs");
    expect(prompt).toContain("**changes**");
    expect(prompt).toContain("**summary**");
    expect(prompt).toContain("GITHUB_OUTPUT");
  });

  it("includes output format spec when outputs required", () => {
    const prompt = buildWorkerPrompt("Work.", {}, ["changes"]);
    expect(prompt).toContain("evidenced");
    expect(prompt).toContain("OUTPUTEOF");
  });

  it("omits outputs section when empty", () => {
    const prompt = buildWorkerPrompt("Work.", {}, []);
    expect(prompt).not.toContain("### Outputs");
    expect(prompt).not.toContain("OUTPUTEOF");
  });

  it("includes workflow context when provided", () => {
    const prompt = buildWorkerPrompt("Work.", {}, [], "dev/implement.yml");
    expect(prompt).toContain("### Context");
    expect(prompt).toContain("dev/implement.yml");
  });

  it("omits context when no workflow file", () => {
    const prompt = buildWorkerPrompt("Work.", {}, []);
    expect(prompt).not.toContain("### Context");
  });

  it("includes skill body", () => {
    const prompt = buildWorkerPrompt("Execute the implementation.", {}, []);
    expect(prompt).toContain("## Workflow");
    expect(prompt).toContain("Execute the implementation.");
  });

  it("includes reject instruction under inputs", () => {
    const prompt = buildWorkerPrompt("Work.", {}, []);
    expect(prompt).toContain("reject_reason");
    const inputsIdx = prompt.indexOf("### Inputs");
    const rejectIdx = prompt.indexOf("reject_reason");
    const workflowIdx = prompt.indexOf("## Workflow");
    expect(inputsIdx).toBeGreaterThan(-1);
    expect(rejectIdx).toBeGreaterThan(inputsIdx);
    expect(rejectIdx).toBeLessThan(workflowIdx);
  });
});

describe("formatInputs", () => {
  it("formats plain input", () => {
    const result = formatInputs({ what: { type: "plain", value: "hello" } });
    expect(result).toBe("- **what**: hello");
  });

  it("formats evidenced input with citations", () => {
    const result = formatInputs({
      what: {
        type: "evidenced",
        body: "JWT auth",
        citations: [
          { type: "uri", source: "src/auth.ts", excerpt: "jwt.sign()" },
          { type: "transcript", excerpt: "migrate to JWT" },
        ],
      },
    });
    expect(result).toContain("**what**: JWT auth");
    expect(result).toContain("source: `src/auth.ts`");
    expect(result).toContain(`"jwt.sign()"`);
    expect(result).toContain("source: `(transcript)`");
    expect(result).toContain(`"migrate to JWT"`);
  });

  it("formats command citation", () => {
    const result = formatInputs({
      ref: {
        type: "evidenced",
        body: "test",
        citations: [{ type: "command", command: "git log", excerpt: "abc123" }],
      },
    });
    expect(result).toContain("source: `git log`");
  });

  it("formats multiple inputs separated by blank lines", () => {
    const result = formatInputs({
      a: { type: "plain", value: "x" },
      b: { type: "plain", value: "y" },
    });
    expect(result).toContain("- **a**: x\n\n- **b**: y");
  });
});

describe("buildInteractiveLaunchPrompt", () => {
  it("includes workflow path", () => {
    const prompt = buildInteractiveLaunchPrompt("dev/implement.yml", []);
    expect(prompt).toContain("dev/implement.yml");
  });

  it("lists required inputs", () => {
    const prompt = buildInteractiveLaunchPrompt("dev/implement.yml", [
      { key: "what", type: "evidenced", description: "実装内容" },
      { key: "where", type: "plain", description: "対象ファイル" },
    ]);
    expect(prompt).toContain("what");
    expect(prompt).toContain("evidenced");
    expect(prompt).toContain("実装内容");
    expect(prompt).toContain("where");
    expect(prompt).toContain("plain");
  });

  it("instructs to run onegai with --input args", () => {
    const prompt = buildInteractiveLaunchPrompt("dev/implement.yml", []);
    expect(prompt).toContain("onegai run dev/implement.yml");
    expect(prompt).toContain("--input");
    expect(prompt).not.toContain("GITHUB_OUTPUT");
  });

  it("explains evidenced JSON inline", () => {
    const prompt = buildInteractiveLaunchPrompt("dev/implement.yml", []);
    expect(prompt).toContain("evidenced");
    expect(prompt).toContain("citations");
  });

  it("instructs quoting of --input argument", () => {
    const prompt = buildInteractiveLaunchPrompt("dev/implement.yml", []);
    expect(prompt).toContain("シングルクォート");
    expect(prompt).toMatch(/--input '[^']+'/);
  });

  it("shows node -e JSON generation for evidenced", () => {
    const prompt = buildInteractiveLaunchPrompt("dev/implement.yml", []);
    expect(prompt).toContain("node -e");
    expect(prompt).toContain("JSON.stringify");
  });
});

describe("OUTPUT_FORMAT_SPEC", () => {
  // heredoc 例をそのまま $GITHUB_OUTPUT に書き込んだときに parseGithubOutputContent が
  // キーを拾えなければならない（行頭固定正規表現との整合性）
  it("evidenced heredoc example parses round-trip", () => {
    const match = OUTPUT_FORMAT_SPEC.match(/cat >> "\$GITHUB_OUTPUT" <<'OUTPUTEOF'\n([\s\S]*?)\nOUTPUTEOF/);
    if (!match) throw new Error("heredoc example not found in OUTPUT_FORMAT_SPEC");
    const parsed = parseGithubOutputContent(match[1]);
    expect(parsed.key).toBeDefined();
    expect(parsed.key.type).toBe("evidenced");
  });

  it("plain example parses", () => {
    const parsed = parseGithubOutputContent("foo=bar");
    expect(parsed.foo).toEqual({ type: "plain", value: "bar" });
  });
});
