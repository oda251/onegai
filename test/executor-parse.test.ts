import { describe, it, expect } from "bun:test";
import { tryParseEvidenced } from "@core/output-format";

describe("tryParseEvidenced", () => {
  it("parses valid evidenced JSON", () => {
    const json = JSON.stringify({
      type: "evidenced",
      body: "implemented auth",
      citations: [{ type: "uri", source: "src/auth.ts", excerpt: "jwt.sign()" }],
    });
    const result = tryParseEvidenced(json);
    expect(result.type).toBe("evidenced");
    if (result.type === "evidenced") {
      expect(result.body).toBe("implemented auth");
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]).toEqual({ type: "uri", source: "src/auth.ts", excerpt: "jwt.sign()" });
    }
  });

  it("parses evidenced with multiple citation types", () => {
    const json = JSON.stringify({
      type: "evidenced",
      body: "refactored",
      citations: [
        { type: "uri", source: "src/a.ts", excerpt: "old code" },
        { type: "transcript", excerpt: "user request" },
        { type: "command", command: "git diff", excerpt: "changes" },
      ],
    });
    const result = tryParseEvidenced(json);
    expect(result.type).toBe("evidenced");
    if (result.type === "evidenced") {
      expect(result.citations).toHaveLength(3);
    }
  });

  it("returns plain for non-JSON string", () => {
    const result = tryParseEvidenced("just plain text");
    expect(result).toEqual({ type: "plain", value: "just plain text" });
  });

  it("returns plain for JSON without evidenced type", () => {
    const result = tryParseEvidenced(JSON.stringify({ type: "other", value: "test" }));
    expect(result.type).toBe("plain");
  });

  it("returns plain for JSON missing body", () => {
    const result = tryParseEvidenced(JSON.stringify({ type: "evidenced", citations: [] }));
    expect(result.type).toBe("plain");
  });

  it("returns plain for JSON missing citations array", () => {
    const result = tryParseEvidenced(JSON.stringify({ type: "evidenced", body: "text" }));
    expect(result.type).toBe("plain");
  });

  it("returns plain for JSON with non-array citations", () => {
    const result = tryParseEvidenced(JSON.stringify({ type: "evidenced", body: "text", citations: "not array" }));
    expect(result.type).toBe("plain");
  });

  it("parses evidenced with empty citations", () => {
    const json = JSON.stringify({ type: "evidenced", body: "text", citations: [] });
    const result = tryParseEvidenced(json);
    expect(result.type).toBe("evidenced");
    if (result.type === "evidenced") {
      expect(result.citations).toEqual([]);
    }
  });
});
