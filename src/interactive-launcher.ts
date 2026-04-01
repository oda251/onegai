import { query } from "@anthropic-ai/claude-agent-sdk";
import { inspectWorkflow } from "./inspect";
import { buildInteractiveLaunchPrompt } from "./prompts";

interface LaunchOptions {
  workflowPath: string;
  cwd: string;
  skillsDirs: string[];
  runStoreDir: string;
}

export async function launchInteractive(options: LaunchOptions): Promise<void> {
  const { workflowPath, cwd, skillsDirs } = options;
  const inspection = inspectWorkflow(workflowPath, skillsDirs);
  const prompt = buildInteractiveLaunchPrompt(workflowPath, inspection.requiredInputs);

  for await (const message of query({
    prompt,
    options: {
      cwd,
      model: "haiku",
      allowedTools: ["Bash", "Read", "Glob", "Grep"],
      permissionMode: "default",
      allowDangerouslySkipPermissions: false,
    },
  })) {
    if ("result" in message) break;
  }
}
