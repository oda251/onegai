import { readFileSync } from "node:fs";
import type { Citation } from "@core/types";
import type { VerificationResult, EvidenceVerifier } from "@core/intent-gate";

export function createDefaultVerifier(): EvidenceVerifier {
  return async (inputs, transcriptPath) => {
    const promises: Promise<VerificationResult>[] = [];

    for (const { key, entry } of Object.values(inputs)) {
      for (const citation of entry.citations) {
        if (!citation.excerpt) continue;
        promises.push(verifyCitation(key, citation, transcriptPath));
      }
    }

    return Promise.all(promises);
  };
}

async function verifyCitation(
  key: string,
  citation: Citation,
  transcriptPath?: string,
): Promise<VerificationResult> {
  if (citation.type === "transcript") {
    return verifyTextFile(key, citation.excerpt, transcriptPath);
  }

  if (citation.type === "command") {
    return { key, ok: true };
  }

  if (isFilePath(citation.source)) {
    if (!isTextFile(citation.source)) {
      return { key, ok: true };
    }
    return verifyTextFile(key, citation.excerpt, citation.source);
  }

  return verifyUri(key, citation);
}

function verifyTextFile(
  key: string,
  excerpt: string,
  path?: string,
): VerificationResult {
  if (!path) {
    return { key, ok: false, detail: "source path not available" };
  }

  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return { key, ok: false, detail: `cannot read: ${path}` };
  }

  const found = content.includes(excerpt);
  return { key, ok: found, detail: found ? undefined : `excerpt not found in ${path}` };
}

async function verifyUri(
  key: string,
  citation: Citation & { type: "uri" },
): Promise<VerificationResult> {
  try {
    const res = await fetch(citation.source, { method: "HEAD" });
    if (res.ok) return { key, ok: true };
    return { key, ok: false, detail: `${citation.source} returned ${res.status}` };
  } catch {
    return { key, ok: false, detail: `cannot reach: ${citation.source}` };
  }
}

function isFilePath(source: string): boolean {
  try {
    return !URL.canParse(source);
  } catch {
    return true;
  }
}

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown",
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".jsonl", ".yaml", ".yml", ".toml",
  ".html", ".htm", ".css", ".scss",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".scala",
  ".c", ".cpp", ".h", ".hpp", ".cs",
  ".sh", ".bash", ".zsh", ".fish",
  ".sql", ".graphql", ".gql",
  ".xml", ".svg", ".csv", ".tsv",
  ".env", ".ini", ".cfg", ".conf",
  ".lock", ".log",
  ".vue", ".svelte", ".astro",
]);

function isTextFile(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
}
