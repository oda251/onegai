import { readFileSync } from "node:fs";
import type { Citation, EvidencedInput } from "./types.js";

export interface VerificationResult {
  key: string;
  citation: Citation;
  ok: boolean;
  detail?: string;
}

export type EvidenceVerifier = (
  inputs: Record<string, { entry: EvidencedInput; key: string }>,
  transcriptPath?: string,
) => Promise<VerificationResult[]>;

export function createDefaultVerifier(): EvidenceVerifier {
  return async (inputs, transcriptPath) => {
    const results: VerificationResult[] = [];

    for (const { key, entry } of Object.values(inputs)) {
      if (!entry.citations) continue;
      for (const citation of entry.citations) {
        if (!citation.excerpt) continue;
        results.push(await verifyCitation(key, citation, transcriptPath));
      }
    }

    return results;
  };
}

async function verifyCitation(
  key: string,
  citation: Citation,
  transcriptPath?: string,
): Promise<VerificationResult> {
  if (citation.type === "transcript") {
    return verifyTextFile(key, citation, transcriptPath);
  }

  // uri: ファイルパスなら grep、それ以外は存在チェック
  if (isFilePath(citation.source)) {
    return verifyTextFile(key, citation, citation.source);
  }

  return verifyUri(key, citation);
}

function verifyTextFile(
  key: string,
  citation: Citation,
  path?: string,
): VerificationResult {
  if (!path) {
    return { key, citation, ok: false, detail: "source path not available" };
  }

  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return { key, citation, ok: false, detail: `cannot read: ${path}` };
  }

  const found = content.includes(citation.excerpt);
  return { key, citation, ok: found, detail: found ? undefined : `excerpt not found in ${path}` };
}

async function verifyUri(
  key: string,
  citation: Citation & { type: "uri" },
): Promise<VerificationResult> {
  try {
    const res = await fetch(citation.source, { method: "HEAD" });
    if (res.ok) return { key, citation, ok: true };
    return { key, citation, ok: false, detail: `${citation.source} returned ${res.status}` };
  } catch {
    return { key, citation, ok: false, detail: `cannot reach: ${citation.source}` };
  }
}

function isFilePath(source: string): boolean {
  return !source.startsWith("http://") && !source.startsWith("https://");
}
