import { describe, it, expect } from "bun:test";
import { resolveOutputRefs, resolveOutputRefsTyped, extractOutputKeys } from "@core/output-resolver";
import type { InputValue } from "@core/types";

function plain(value: string): InputValue {
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
    const evidenced: InputValue = {
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
    const evidenced: InputValue = {
      type: "evidenced",
      body: "summary",
      citations: [{ type: "uri", source: "file.ts", excerpt: "code" }],
    };
    const result = resolveOutputRefsTyped(
      "${{ steps.impl.outputs.changes }}",
      { impl: { changes: evidenced } },
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual(evidenced);
  });

  it("returns plain for single reference to plain value", () => {
    const result = resolveOutputRefsTyped(
      "${{ steps.impl.outputs.msg }}",
      { impl: { msg: plain("hello") } },
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual({ type: "plain", value: "hello" });
  });

  it("errors when evidenced is mixed with text", () => {
    const evidenced: InputValue = {
      type: "evidenced",
      body: "summary",
      citations: [{ type: "uri", source: "file.ts", excerpt: "code" }],
    };
    const result = resolveOutputRefsTyped(
      "prefix ${{ steps.impl.outputs.changes }} suffix",
      { impl: { changes: evidenced } },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toContain("evidenced output cannot be mixed with text");
  });

  it("allows plain mixed with text", () => {
    const result = resolveOutputRefsTyped(
      "prefix ${{ steps.impl.outputs.msg }} suffix",
      { impl: { msg: plain("hello") } },
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual({ type: "plain", value: "prefix hello suffix" });
  });

  it("returns empty plain for missing reference", () => {
    const result = resolveOutputRefsTyped(
      "${{ steps.missing.outputs.key }}",
      {},
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual({ type: "plain", value: "" });
  });

  it("returns plain for non-reference text", () => {
    const result = resolveOutputRefsTyped("literal text", {});
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual({ type: "plain", value: "literal text" });
  });
});

describe("extractOutputKeys", () => {
  it("extracts keys referenced by downstream steps", () => {
    const workflow = {
      name: "test",
      jobs: {
        build: {
          id: "build", needs: [] as string[],
          steps: [
            { type: "skill" as const, skill: "dev/impl", id: "impl" },
            { type: "skill" as const, skill: "dev/review", inputs: { changes: "${{ steps.impl.outputs.changes }}" } },
          ],
        },
      },
    };
    expect(extractOutputKeys(workflow, "impl")).toEqual(["changes"]);
  });

  it("extracts multiple keys", () => {
    const workflow = {
      name: "test",
      jobs: {
        build: {
          id: "build", needs: [] as string[],
          steps: [
            { type: "skill" as const, skill: "dev/impl", id: "impl" },
            { type: "skill" as const, skill: "dev/report", inputs: {
              changes: "${{ steps.impl.outputs.changes }}",
              summary: "${{ steps.impl.outputs.summary }}",
            }},
          ],
        },
      },
    };
    expect(extractOutputKeys(workflow, "impl").sort()).toEqual(["changes", "summary"]);
  });

  it("returns empty for unreferenced step", () => {
    const workflow = {
      name: "test",
      jobs: {
        build: {
          id: "build", needs: [] as string[],
          steps: [
            { type: "skill" as const, skill: "dev/impl", id: "impl" },
            { type: "run" as const, run: "echo ok" },
          ],
        },
      },
    };
    expect(extractOutputKeys(workflow, "impl")).toEqual([]);
  });

  it("ignores references to other steps", () => {
    const workflow = {
      name: "test",
      jobs: {
        build: {
          id: "build", needs: [] as string[],
          steps: [
            { type: "skill" as const, skill: "dev/impl", id: "impl" },
            { type: "skill" as const, skill: "dev/other", inputs: { x: "${{ steps.other.outputs.foo }}" } },
          ],
        },
      },
    };
    expect(extractOutputKeys(workflow, "impl")).toEqual([]);
  });
});
