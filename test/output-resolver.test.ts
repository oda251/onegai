import { describe, it, expect } from "bun:test";
import { resolveOutputRefs, extractOutputKeys } from "../src/output-resolver";

describe("resolveOutputRefs", () => {
  it("replaces step output references", () => {
    const result = resolveOutputRefs(
      '${{ steps.impl.outputs.changes }}',
      { impl: { changes: "src/auth.ts" } },
    );
    expect(result).toBe("src/auth.ts");
  });

  it("replaces multiple references", () => {
    const result = resolveOutputRefs(
      '{"a": "${{ steps.x.outputs.foo }}", "b": "${{ steps.y.outputs.bar }}"}',
      { x: { foo: "1" }, y: { bar: "2" } },
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
      { impl: { changes: "file.ts" } },
    );
    expect(result).toBe("file.ts");
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
