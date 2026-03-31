import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

export function findRepoRoot(from: string): string | undefined {
  let dir = from;
  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function resolveClaudeDirs(cwd: string, subfolder: string): string[] {
  const repoRoot = findRepoRoot(cwd);
  const candidates = [
    join(cwd, ".claude", subfolder),
    repoRoot ? join(repoRoot, ".claude", subfolder) : "",
    join(process.env.HOME ?? "", ".claude", subfolder),
  ];
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const dir of candidates) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    if (existsSync(dir)) dirs.push(dir);
  }
  return dirs;
}

export function resolveWorkflowsDirs(cwd: string): string[] {
  return resolveClaudeDirs(cwd, "workflows");
}

export function resolveSkillsDirs(cwd: string): string[] {
  return resolveClaudeDirs(cwd, "skills");
}

export function findWorkflowFiles(dirs: string[]): string[] {
  const files: string[] = [];
  for (const dir of dirs) {
    collectYml(dir, files);
  }
  return files.sort();
}

function collectYml(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectYml(full, out);
    } else if (entry.name.endsWith(".yml")) {
      out.push(full);
    }
  }
}
