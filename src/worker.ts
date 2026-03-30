import { query } from "@anthropic-ai/claude-agent-sdk";

export interface WorkerConfig {
  serverUrl: string;
  cwd: string;
}

export interface WorkerOptions {
  tools?: string[];
  permissionMode?: string;
}

export type SpawnWorkerFn = (prompt: string, taskId: string, options?: WorkerOptions) => void;

export function createWorkerSpawner(config: WorkerConfig): SpawnWorkerFn {
  return (prompt: string, taskId: string, options?: WorkerOptions) => {
    runWorker(prompt, taskId, config, options).catch((err) => {
      console.error(`[sidekick] worker ${taskId} failed:`, err);
    });
  };
}

async function runWorker(
  prompt: string,
  taskId: string,
  config: WorkerConfig,
  options?: WorkerOptions,
): Promise<void> {
  console.log(`[sidekick] spawning worker for task ${taskId}`);

  for await (const message of query({
    prompt,
    options: {
      cwd: config.cwd,
      allowedTools: options?.tools,
      mcpServers: {
        sidekick: { url: config.serverUrl },
      },
      permissionMode: (options?.permissionMode ?? "auto") as "auto",
      allowDangerouslySkipPermissions: true,
      maxTurns: 50,
    },
  })) {
    if ("result" in message) {
      console.log(`[sidekick] worker ${taskId} finished`);
    }
  }
}
