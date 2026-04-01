import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync("/tmp/licenses.json", "utf8"));
const lines = [];

for (const [pkg, info] of Object.entries(data)) {
  if (pkg.startsWith("@anthropic-ai/claude-agent-sdk")) continue;
  lines.push("---");
  lines.push(`Package: ${pkg}`);
  lines.push(`License: ${info.licenses || "UNKNOWN"}`);
  if (info.repository) lines.push(`Repository: ${info.repository}`);
  if (info.licenseFile) {
    try {
      lines.push("", readFileSync(info.licenseFile, "utf8").trim());
    } catch {}
  }
  lines.push("");
}

writeFileSync("THIRD_PARTY_LICENSES", lines.join("\n"));
console.log(`Generated THIRD_PARTY_LICENSES: ${Object.keys(data).length} packages`);
