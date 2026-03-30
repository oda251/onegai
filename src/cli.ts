#!/usr/bin/env node

import { resolve } from "node:path";
import * as v from "valibot";
import { lint } from "./workflow-loader.js";
import { startServer } from "./server.js";
import { exhaustive } from "./types.js";

const EnvSchema = v.object({
  SIDEKICK_SKILLS_DIR: v.optional(v.string()),
  SIDEKICK_PORT: v.optional(v.string()),
  HOME: v.optional(v.string()),
});

const env = v.parse(EnvSchema, process.env);

const DEFAULT_PORT = 4312;

function resolvePort(args: string[]): number {
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
  return DEFAULT_PORT;
}

function resolveWorkflowsDir(args: string[]): string {
  const dirIndex = args.indexOf("--dir");
  if (dirIndex !== -1 && args[dirIndex + 1]) {
    return resolve(args[dirIndex + 1]);
  }
  return env.SIDEKICK_SKILLS_DIR ?? resolve(env.HOME ?? "~", ".claude", "skills");
}

const COMMANDS = ["serve", "lint"] as const;
type Command = (typeof COMMANDS)[number];

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  printUsage();
} else if (!COMMANDS.includes(command as Command)) {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
} else {
  const cmd = command as Command;
  switch (cmd) {
    case "serve": {
      const stop = await startServer(resolveWorkflowsDir(args), resolvePort(args));
      process.on("SIGINT", () => { stop(); process.exit(0); });
      break;
    }
    case "lint":
      runLint(resolveWorkflowsDir(args));
      break;
    default:
      exhaustive(cmd);
  }
}

function runLint(dir: string) {
  const errors = lint(dir);

  if (errors.length === 0) {
    console.log("✓ All skills valid");
    process.exit(0);
  }

  for (const e of errors) {
    console.error(`✗ ${e.file}: ${e.message}`);
  }
  process.exit(1);
}

function printUsage() {
  console.log(`sidekick - Agent workflow orchestrator

Commands:
  serve [--dir path] [--port N]   Start HTTP MCP server (default: 4312)
  lint [--dir path]               Validate workflow definitions`);
}
