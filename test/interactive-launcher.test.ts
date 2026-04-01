import { describe, it, expect } from "bun:test";
import { buildInteractiveLaunchPrompt } from "../src/prompts";

describe("buildInteractiveLaunchPrompt", () => {
  it("includes workflow path", () => {
    const prompt = buildInteractiveLaunchPrompt("dev/implement.yml", []);
    expect(prompt).toContain("dev/implement.yml");
  });

  it("lists required inputs with types and descriptions", () => {
    const prompt = buildInteractiveLaunchPrompt("dev/implement.yml", [
      { key: "what", type: "evidenced", description: "実装内容" },
      { key: "where", type: "plain", description: "対象ファイル" },
    ]);
    expect(prompt).toContain("what");
    expect(prompt).toContain("evidenced");
    expect(prompt).toContain("実装内容");
    expect(prompt).toContain("where");
    expect(prompt).toContain("plain");
    expect(prompt).toContain("対象ファイル");
  });

  it("instructs to run the workflow with collected inputs", () => {
    const prompt = buildInteractiveLaunchPrompt("dev/implement.yml", [
      { key: "what", type: "evidenced", description: "実装内容" },
    ]);
    expect(prompt).toContain("onegai run");
    expect(prompt).toContain("GITHUB_OUTPUT");
  });

  it("handles empty required inputs", () => {
    const prompt = buildInteractiveLaunchPrompt("dev/implement.yml", []);
    expect(prompt).toContain("dev/implement.yml");
    // Should still instruct to run, even with no inputs to collect
    expect(prompt).toContain("onegai run");
  });
});
