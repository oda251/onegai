import { ok, err, type Result } from "neverthrow";
import type { EvidencedInput, InputValue } from "@core/types";

export interface VerificationResult {
  key: string;
  ok: boolean;
  detail?: string;
}

export type EvidenceVerifier = (
  inputs: Record<string, { entry: EvidencedInput; key: string }>,
  transcriptPath?: string,
) => Promise<VerificationResult[]>;

export function runIntentGate(
  inputs: Record<string, InputValue>,
  verifier: EvidenceVerifier,
  transcriptPath?: string,
): Promise<Result<undefined, string>> {
  const evidenced: Record<string, { entry: EvidencedInput; key: string }> = {};
  for (const [k, entry] of Object.entries(inputs)) {
    if (entry.type === "evidenced") evidenced[k] = { entry, key: k };
  }

  if (Object.keys(evidenced).length === 0) return Promise.resolve(ok(undefined));

  return verifier(evidenced, transcriptPath).then((results) => {
    const failed = results.filter((r): r is VerificationResult & { detail: string } => !r.ok && !!r.detail);
    if (failed.length > 0) {
      return err(`Intent Gate failed: ${failed.map((r) => `${r.key}: ${r.detail}`).join("; ")}`);
    }
    return ok(undefined);
  });
}
