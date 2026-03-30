import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import * as v from "valibot";
import { loadWorkflows } from "./workflow-loader.js";
import { TaskStore } from "./task-store.js";
import {
  listWorkflows,
  runWorkflow,
  completeTask,
  rejectTask,
  getStatus,
  findRootTaskId,
  getSettledGroup,
} from "./handlers.js";
import type { Workflow, Task } from "./types.js";
import { createWorkerSpawner, type SpawnWorkerFn } from "./worker.js";
import { defaults, serverUrl, type ServerConfig } from "./config.js";

// --- Valibot schemas (input validation) ---

const CitationSchema = v.union([
  v.object({ type: v.literal("transcript"), excerpt: v.string() }),
  v.object({ type: v.literal("uri"), source: v.string(), excerpt: v.string() }),
]);

const InputValueSchema = v.object({
  body: v.pipe(v.string(), v.minLength(1)),
  citations: v.optional(v.array(CitationSchema)),
});

const RunArgsSchema = v.object({
  type: v.pipe(v.string(), v.minLength(1)),
  title: v.pipe(v.string(), v.minLength(1)),
  inputs: v.record(v.string(), InputValueSchema),
  group: v.optional(v.string()),
});

const StatusArgsSchema = v.object({
  taskId: v.optional(v.string()),
});

const DoneArgsSchema = v.object({
  taskId: v.pipe(v.string(), v.minLength(1)),
  output: v.record(v.string(), v.string()),
});

const RejectArgsSchema = v.object({
  taskId: v.pipe(v.string(), v.minLength(1)),
  reason: v.pipe(v.string(), v.minLength(1)),
});

const RegisterTranscriptArgsSchema = v.object({
  path: v.pipe(v.string(), v.minLength(1)),
});

// --- MCP response helpers ---

function textResponse(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResponse(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true as const };
}

function jsonResponse(data: unknown) {
  return textResponse(JSON.stringify(data, null, 2));
}

function validationError(issues: v.BaseIssue<unknown>[]) {
  return errorResponse(`Invalid arguments: ${issues.map((i) => i.message).join("; ")}`);
}

// --- Notification (shell: routes events to MCP sessions) ---

type NotifyFn = (event: string, params: Record<string, unknown>) => void;

function notifyCaller(
  notifiers: Map<string, NotifyFn>,
  callerId: string | undefined,
  event: string,
  params: Record<string, unknown>,
) {
  if (!callerId) return;
  const fn = notifiers.get(callerId);
  if (fn) fn(event, params);
}

function notifyTaskSettled(
  notifiers: Map<string, NotifyFn>,
  store: TaskStore,
  task: Task,
  event: string,
  extra: Record<string, unknown>,
) {
  const rootId = findRootTaskId(store, task.id);
  const rootTask = rootId !== task.id ? store.get(rootId) : task;
  notifyCaller(notifiers, task.caller, event, {
    taskId: rootId,
    title: (rootTask ?? task).title,
    ...extra,
  });
}

function notifyIfGroupSettled(
  notifiers: Map<string, NotifyFn>,
  store: TaskStore,
  task: Task,
) {
  const settled = getSettledGroup(store, task);
  if (!settled) return;
  notifyCaller(notifiers, task.caller, "group.done", {
    group: settled.group,
    tasks: settled.tasks.map((t) => ({ taskId: t.id, title: t.title, status: t.status })),
  });
}

// --- MCP tool definitions ---

const TOOL_DEFINITIONS = [
  {
    name: "workflows",
    description:
      "List available workflow types with their descriptions and required inputs",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "run",
    description: "Start a task with a specific workflow type",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: { type: "string", description: "Workflow type (e.g. dev/impl)" },
        title: { type: "string", description: "Task title" },
        inputs: { type: "object", description: "Input parameters — values are {body, citations?} objects" },
        group: { type: "string", description: "Optional group ID for parallel execution" },
      },
      required: ["type", "title", "inputs"],
    },
  },
  {
    name: "done",
    description: "Complete a running task with output values",
    inputSchema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string", description: "Task ID to complete" },
        output: { type: "object", description: "Output key-value pairs" },
      },
      required: ["taskId", "output"],
    },
  },
  {
    name: "reject",
    description: "Reject a running task with a reason",
    inputSchema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string", description: "Task ID to reject" },
        reason: { type: "string", description: "Rejection reason" },
      },
      required: ["taskId", "reason"],
    },
  },
  {
    name: "status",
    description: "Get status of tasks",
    inputSchema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string", description: "Optional task ID to filter by" },
      },
    },
  },
  {
    name: "register-transcript",
    description: "Register the transcript file path for the current session",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Absolute path to the transcript JSONL file" },
      },
      required: ["path"],
    },
  },
];

// --- MCP server wiring ---

interface McpContext {
  workflows: Map<string, Workflow>;
  store: TaskStore;
  callerId: string;
  notifiers: Map<string, NotifyFn>;
  transcriptStore: { path?: string };
  spawnWorker?: SpawnWorkerFn;
}

function configureMcpServer(server: Server, ctx: McpContext) {
  const { workflows, store, callerId, notifiers, transcriptStore, spawnWorker } = ctx;
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "workflows":
        return jsonResponse(listWorkflows(workflows));

      case "run": {
        const parsed = v.safeParse(RunArgsSchema, args);
        if (!parsed.success) return validationError(parsed.issues);
        return runWorkflow(workflows, store, { ...parsed.output, caller: callerId, transcriptPath: transcriptStore.path }).match(
          (data) => {
            if (spawnWorker) spawnWorker(data.prompt, data.taskId);
            return jsonResponse(data);
          },
          (e) => errorResponse(e),
        );
      }

      case "done": {
        const parsed = v.safeParse(DoneArgsSchema, args);
        if (!parsed.success) return validationError(parsed.issues);
        return completeTask(workflows, store, parsed.output, transcriptStore.path).match(
          (data) => {
            const task = store.get(data.taskId);
            if (!data.next && task) notifyTaskSettled(notifiers, store, task, "task.done", { output: data.output });
            if (data.next && spawnWorker) spawnWorker(data.next.prompt, data.next.taskId);
            if (task) notifyIfGroupSettled(notifiers, store, task);
            return jsonResponse(data);
          },
          (e) => errorResponse(e),
        );
      }

      case "reject": {
        const parsed = v.safeParse(RejectArgsSchema, args);
        if (!parsed.success) return validationError(parsed.issues);
        return rejectTask(store, parsed.output).match(
          (data) => {
            const task = store.get(data.taskId);
            if (task) {
              notifyTaskSettled(notifiers, store, task, "task.rejected", { reason: data.reason });
              notifyIfGroupSettled(notifiers, store, task);
            }
            return jsonResponse(data);
          },
          (e) => errorResponse(e),
        );
      }

      case "status": {
        const parsed = v.safeParse(StatusArgsSchema, args);
        if (!parsed.success) return validationError(parsed.issues);
        return getStatus(store, parsed.output.taskId).match(
          (data) => jsonResponse(data),
          (e) => errorResponse(e),
        );
      }

      case "register-transcript": {
        const parsed = v.safeParse(RegisterTranscriptArgsSchema, args);
        if (!parsed.success) return validationError(parsed.issues);
        transcriptStore.path = parsed.output.path;
        return textResponse(`Transcript registered: ${parsed.output.path}`);
      }

      default:
        return errorResponse(`Unknown tool: ${name}`);
    }
  });
}

function newMcpServer() {
  return new Server(
    { name: "sidekick", version: "0.1.0" },
    { capabilities: { tools: {}, logging: {} } },
  );
}

function createServerCore(workflowsDir: string) {
  const { workflows, errors } = loadWorkflows(workflowsDir);
  for (const e of errors) {
    console.error(`[sidekick] workflow error: ${e.file}: ${e.message}`);
  }
  return { workflows, store: new TaskStore() };
}

// --- Exports ---

export function createServer(workflowsDir: string) {
  const { workflows, store } = createServerCore(workflowsDir);
  const server = newMcpServer();
  const notifiers = new Map<string, NotifyFn>();
  const callerId = "default";

  notifiers.set(callerId, (event, params) => {
    server
      .sendLoggingMessage({ level: "info", logger: "sidekick", data: { event, ...params } })
      .catch(() => {});
  });

  const transcriptStore: { path?: string } = {};
  configureMcpServer(server, { workflows, store, callerId, notifiers, transcriptStore });
  return { server, store, workflows };
}

export async function startServer(config: Pick<ServerConfig, "workflowsDir" | "port"> & Partial<ServerConfig>) {
  const fullConfig: ServerConfig = {
    hostname: defaults.hostname,
    cwd: process.cwd(),
    ...config,
  };
  const { workflows, store } = createServerCore(fullConfig.workflowsDir);
  const notifiers = new Map<string, NotifyFn>();
  const transcriptStore: { path?: string } = {};
  const spawnWorker = createWorkerSpawner({
    serverUrl: serverUrl(fullConfig),
    cwd: fullConfig.cwd,
  });
  const sessions = new Map<
    string,
    { transport: WebStandardStreamableHTTPServerTransport; server: Server }
  >();

  function createSession(): WebStandardStreamableHTTPServerTransport {
    const callerId = crypto.randomUUID();
    const server = newMcpServer();

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => callerId,
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { transport, server });
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
        notifiers.delete(transport.sessionId);
      }
    };

    notifiers.set(callerId, (event, params) => {
      server
        .sendLoggingMessage({ level: "info", logger: "sidekick", data: { event, ...params } })
        .catch(() => {});
    });

    configureMcpServer(server, { workflows, store, callerId, notifiers, transcriptStore, spawnWorker });
    server.connect(transport);

    return transport;
  }

  const httpServer = Bun.serve({
    port: fullConfig.port,
    hostname: fullConfig.hostname,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== defaults.mcpPath) {
        return new Response("Not Found", { status: 404 });
      }

      const sessionId = req.headers.get("mcp-session-id");
      const existing = sessionId ? sessions.get(sessionId) : undefined;

      if (existing) {
        return existing.transport.handleRequest(req);
      }

      if (sessionId) {
        return new Response("Session not found", { status: 404 });
      }

      if (req.method === "POST") {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (isInitializeRequest(body)) {
          const transport = createSession();
          return transport.handleRequest(req, { parsedBody: body });
        }
      }

      return new Response("Bad Request", { status: 400 });
    },
  });

  console.log(`[sidekick] listening on ${serverUrl(fullConfig)}`);

  return function stop() {
    for (const { transport } of sessions.values()) {
      transport.close();
    }
    httpServer.stop();
  };
}
