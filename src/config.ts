import { resolve } from "node:path";
import * as v from "valibot";

const EnvSchema = v.object({
  SIDEKICK_SKILLS_DIR: v.optional(v.string()),
  SIDEKICK_PORT: v.optional(v.string()),
  HOME: v.optional(v.string()),
});

const env = v.parse(EnvSchema, process.env);

export const defaults = {
  port: 4312,
  hostname: "127.0.0.1",
  skillsDir: env.SIDEKICK_SKILLS_DIR ?? resolve(env.HOME ?? "~", ".claude", "skills"),
  mcpPath: "/mcp",
} as const;

export interface ServerConfig {
  workflowsDir: string;
  port: number;
  hostname: string;
  cwd: string;
}

export function serverUrl(config: Pick<ServerConfig, "hostname" | "port">): string {
  return `http://${config.hostname}:${config.port}${defaults.mcpPath}`;
}

export function resolvePort(args: string[]): number {
  const portIndex = args.indexOf("--port");
  if (portIndex !== -1 && args[portIndex + 1]) {
    const port = Number(args[portIndex + 1]);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      console.error(`Invalid port: ${args[portIndex + 1]}`);
      process.exit(1);
    }
    return port;
  }
  if (env.SIDEKICK_PORT) {
    const port = Number(env.SIDEKICK_PORT);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      console.error(`Invalid SIDEKICK_PORT: ${env.SIDEKICK_PORT}`);
      process.exit(1);
    }
    return port;
  }
  return defaults.port;
}

export function resolveWorkflowsDir(args: string[]): string {
  const dirIndex = args.indexOf("--dir");
  if (dirIndex !== -1 && args[dirIndex + 1]) {
    return resolve(args[dirIndex + 1]);
  }
  return defaults.skillsDir;
}
