import type { InputValue } from "@core/types";

export function tryParseEvidenced(raw: string): InputValue {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.type === "evidenced" && typeof parsed.body === "string" && Array.isArray(parsed.citations)) {
      return { type: "evidenced", body: parsed.body, citations: parsed.citations };
    }
  } catch { /* not JSON or not evidenced */ }
  return { type: "plain", value: raw };
}

export function parseGithubOutputContent(content: string): Record<string, InputValue> {
  const outputs: Record<string, InputValue> = {};

  const heredocPattern = /^(\w+)<<(\S+)\n([\s\S]*?)\n\2$/gm;
  let match;
  while ((match = heredocPattern.exec(content)) !== null) {
    outputs[match[1]] = tryParseEvidenced(match[3]);
  }

  for (const line of content.split("\n")) {
    if (line.includes("<<")) continue;
    const eq = line.indexOf("=");
    if (eq > 0) {
      const key = line.slice(0, eq);
      if (!(key in outputs)) outputs[key] = { type: "plain", value: line.slice(eq + 1) };
    }
  }

  return outputs;
}
