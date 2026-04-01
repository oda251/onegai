import { describe, it, expect } from "bun:test";
import { resolveOutputRefs, resolveOutputRefsTyped, extractOutputKeys } from "../src/output-resolver";
import type { InputEntry } from "../src/types";

function plain(value: string): InputEntry {
  return { type: "plain", value };
}

describe("resolveOutputRefs", () => {
  it("replaces step output references", () => {
    const result = resolveOutputRefs(
      '${{ steps.impl.outputs.changes }}',
      { impl: { changes: plain("src/auth.ts") } },
    );
    expect(result).toBe("src/auth.ts");
  });

  it("replaces multiple references", () => {
    const result = resolveOutputRefs(
      '{"a": "${{ steps.x.outputs.foo }}", "b": "${{ steps.y.outputs.bar }}"}',
      { x: { foo: plain("1") }, y: { bar: plain("2") } },
    );
    expect(result).toBe('{"a": "1", "b": "2"}');
  });

  it("replaces missing references with empty string", () => {
    const result = resolveOutputRefs(
      "${{ steps.missing.outputs.key }}",
      {},
    );
    expect(result).toBe("");
  });

  it("leaves non-matching text unchanged", () => {
    const result = resolveOutputRefs("plain text", {});
    expect(result).toBe("plain text");
  });

  it("handles whitespace in expression", () => {
    const result = resolveOutputRefs(
      "${{  steps.impl.outputs.changes  }}",
      { impl: { changes: plain("file.ts") } },
    );
    expect(result).toBe("file.ts");
  });

  it("extracts body from evidenced entries in string context", () => {
    const evidenced: InputEntry = {
      type: "evidenced",
      body: "summary text",
      citations: [{ type: "uri", source: "file.ts", excerpt: "code" }],
    };
    const result = resolveOutputRefs(
      "Result: ${{ steps.impl.outputs.changes }}",
      { impl: { changes: evidenced } },
    );
    expect(result).toBe("Result: summary text");
  });
});

describe("resolveOutputRefsTyped", () => {
  it("returns evidenced entry for single reference", () => {
    const evidenced: InputEntry = {
      type: "evidenced",
      body: "summary",
      citations: [{ type: "uri", source: "file.ts", excerpt: "code" }],
    };
    const result = resolveOutputRefsTyped(
      "${{ steps.impl.outputs.changes }}",
      { impl: { changes: evidenced } },
    );
    expect(result).toEqual({ ok: true, entry: evidenced });
  });

  it("returns plain for single reference to plain value", () => {
    const result = resolveOutputRefsTyped(
      "${{ steps.impl.outputs.msg }}",
      { impl: { msg: plain("hello") } },
    );
    expect(result).toEqual({ ok: true, entry: { type: "plain", value: "hello" } });
  });

  it("errors when evidenced is mixed with text", () => {
    const evidenced: InputEntry = {
      type: "evidenced",
      body: "summary",
      citations: [{ type: "uri", source: "file.ts", excerpt: "code" }],
    };
    const result = resolveOutputRefsTyped(
      "prefix ${{ steps.impl.outputs.changes }} suffix",
      { impl: { changes: evidenced } },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("evidenced output cannot be mixed with text");
    }
  });

  it("allows plain mixed with text", () => {
    const result = resolveOutputRefsTyped(
      "prefix ${{ steps.impl.outputs.msg }} suffix",
      { impl: { msg: plain("hello") } },
    );
    expect(result).toEqual({ ok: true, entry: { type: "plain", value: "prefix hello suffix" } });
  });

  it("returns empty plain for missing reference", () => {
    const result = resolveOutputRefsTyped(
      "${{ steps.missing.outputs.key }}",
      {},
    );
    expect(result).toEqual({ ok: true, entry: { type: "plain", value: "" } });
  });

  it("returns plain for non-reference text", () => {
    const result = resolveOutputRefsTyped("literal text", {});
    expect(result).toEqual({ ok: true, entry: { type: "plain", value: "literal text" } });
  });
});

describe("extractOutputKeys", () => {
  it("extracts keys referenced by downstream steps", () => {
    const workflow = {
      jobs: {
        build: {
          steps: [
            { id: "impl", type: "skill" as const, skill: "dev/impl" },
            {
              type: "skill" as const,
              skill: "dev/review",
              inputs: { changes: "${{ steps.impl.outputs.changes }}" },
            },
          ],
        },
      },
    };
    const keys = extractOutputKeys(workflow, "impl");
    expect(keys).toEqual(["changes"]);
  });

  it("extracts multiple keys", () => {
    const workflow = {
      jobs: {
        build: {
          steps: [
            { id: "impl" },
            {
              inputs: {
                changes: "${{ steps.impl.outputs.changes }}",
                summary: "${{ steps.impl.outputs.summary }}",
              },
            },
          ],
        },
      },
    };
    const keys = extractOutputKeys(workflow, "impl");
    expect(keys.sort()).toEqual(["changes", "summary"]);
  });

  it("returns empty for unreferenced step", () => {
    const workflow = {
      jobs: {
        build: {
          steps: [{ id: "impl" }, { inputs: {} }],
        },
      },
    };
    expect(extractOutputKeys(workflow, "impl")).toEqual([]);
  });

  it("ignores references to other steps", () => {
    const workflow = {
      jobs: {
        build: {
          steps: [
            { id: "impl" },
            { inputs: { x: "${{ steps.other.outputs.foo }}" } },
          ],
        },
      },
    };
    expect(extractOutputKeys(workflow, "impl")).toEqual([]);
  });
});
