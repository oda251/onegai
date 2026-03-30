import { query } from "@anthropic-ai/claude-agent-sdk";

export interface WorkerConfig {
  serverUrl: string;
  cwd: string;
}

export type SpawnWorkerFn = (prompt: string, taskId: string) => void;

export function createWorkerSpawner(config: WorkerConfig): SpawnWorkerFn {
  return (prompt: string, taskId: string) => {
    runWorker(prompt, taskId, config).catch((err) => {
      console.error(`[sidekick] worker ${taskId} failed:`, err);
    });
  };
}

async function runWorker(
  prompt: string,
  taskId: string,
  config: WorkerConfig,
): Promise<void> {
  console.log(`[sidekick] spawning worker for task ${taskId}`);

  for await (const message of query({
    prompt,
    options: {
      cwd: config.cwd,
      allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
      mcpServers: {
        sidekick: { url: config.serverUrl },
      },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 50,
    },
  })) {
    if ("result" in message) {
      console.log(`[sidekick] worker ${taskId} finished`);
    }
  }
}
