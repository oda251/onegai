import { describe, it, expect } from "bun:test";
import { runIntentGate } from "@core/intent-gate";
import type { InputValue } from "@core/types";
import type { EvidenceVerifier, VerificationResult } from "@core/intent-gate";

function allPass(): EvidenceVerifier {
  return async (inputs) => {
    const results: VerificationResult[] = [];
    for (const { key, entry } of Object.values(inputs)) {
      for (const citation of entry.citations) {
        if (citation.excerpt) results.push({ key, ok: true });
      }
    }
    return results;
  };
}

function allFail(detail: string): EvidenceVerifier {
  return async (inputs) => {
    const results: VerificationResult[] = [];
    for (const { key, entry } of Object.values(inputs)) {
      for (const citation of entry.citations) {
        if (citation.excerpt) results.push({ key, ok: false, detail });
      }
    }
    return results;
  };
}

describe("runIntentGate", () => {
  it("passes when no evidenced inputs", async () => {
    const inputs: Record<string, InputValue> = {
      what: { type: "plain", value: "hello" },
    };
    const result = await runIntentGate(inputs, allFail("should not be called"));
    expect(result.isOk()).toBe(true);
  });

  it("passes when all citations verify", async () => {
    const inputs: Record<string, InputValue> = {
      what: {
        type: "evidenced",
        body: "JWT auth",
        citations: [{ type: "uri", source: "src/auth.ts", excerpt: "jwt.sign()" }],
      },
    };
    const result = await runIntentGate(inputs, allPass());
    expect(result.isOk()).toBe(true);
  });

  it("fails when citation verification fails", async () => {
    const inputs: Record<string, InputValue> = {
      what: {
        type: "evidenced",
        body: "JWT auth",
        citations: [{ type: "uri", source: "src/auth.ts", excerpt: "jwt.sign()" }],
      },
    };
    const result = await runIntentGate(inputs, allFail("excerpt not found"));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toContain("Intent Gate failed");
      expect(result.error).toContain("what");
      expect(result.error).toContain("excerpt not found");
    }
  });

  it("checks multiple evidenced inputs", async () => {
    const verifiedKeys: string[] = [];
    const trackingVerifier: EvidenceVerifier = async (inputs) => {
      const results: VerificationResult[] = [];
      for (const { key, entry } of Object.values(inputs)) {
        verifiedKeys.push(key);
        for (const citation of entry.citations) {
          if (citation.excerpt) results.push({ key, ok: true });
        }
      }
      return results;
    };

    const inputs: Record<string, InputValue> = {
      what: { type: "evidenced", body: "a", citations: [{ type: "transcript", excerpt: "x" }] },
      where: { type: "evidenced", body: "b", citations: [{ type: "uri", source: "f.ts", excerpt: "y" }] },
      extra: { type: "plain", value: "ignored" },
    };

    await runIntentGate(inputs, trackingVerifier);
    expect(verifiedKeys.sort()).toEqual(["what", "where"]);
  });

  it("skips citations without excerpt", async () => {
    let callCount = 0;
    const countingVerifier: EvidenceVerifier = async () => {
      callCount++;
      return [];
    };

    const inputs: Record<string, InputValue> = {
      what: { type: "evidenced", body: "a", citations: [{ type: "uri", source: "f.ts", excerpt: "" }] },
    };

    const result = await runIntentGate(inputs, countingVerifier);
    expect(result.isOk()).toBe(true);
    expect(callCount).toBe(1);
  });

  it("reports only failed results with detail", async () => {
    const mixedVerifier: EvidenceVerifier = async () => [
      { key: "a", ok: true },
      { key: "b", ok: false, detail: "not found" },
      { key: "c", ok: false },
    ];

    const inputs: Record<string, InputValue> = {
      a: { type: "evidenced", body: "x", citations: [{ type: "transcript", excerpt: "1" }] },
    };

    const result = await runIntentGate(inputs, mixedVerifier);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toContain("b: not found");
      expect(result.error).not.toContain("c:");
    }
  });
});
