import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type ServerNotification,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { declareProviderKeyEnvVar, isMachineTranslationEnabled, redact } from "@verbatra/sdk";
import { z } from "zod";
import { readPackageManifest } from "./package-manifest.js";
import { createProgressReporter, type ProgressReporter } from "./progress-reporter.js";
import type { McpProjectState } from "./project-session.js";
import { MCP_SERVER_INSTRUCTIONS } from "./server-instructions.js";
import type { McpToolOutcome, RegisteredMcpTool } from "./tools/define-tool.js";
import { editEntryTool } from "./tools/edit-entry.js";
import { createMcpInFlightGuard } from "./tools/in-flight-guard.js";
import { buildToolRegistry } from "./tools/registry.js";
import { retranslateEntryTool } from "./tools/retranslate-entry.js";
import { translatePendingTool } from "./tools/translate-pending.js";
import { describeUnconfiguredRefusal } from "./tools/unconfigured-refusal.js";
import type { McpCallScope, McpServerOptions, McpToolContext } from "./types.js";

const GUARDED_TOOL_NAMES: ReadonlySet<string> = new Set([
  retranslateEntryTool.name,
  editEntryTool.name,
  translatePendingTool.name,
]);

const ALREADY_IN_PROGRESS_MESSAGE =
  "A matching call is already in progress; wait for it to finish.";

const entryDedupeParamsSchema = z.object({ locale: z.string(), key: z.string() });

function entryDedupeKey(params: unknown): string | undefined {
  const parsed = entryDedupeParamsSchema.safeParse(params);
  return parsed.success ? JSON.stringify([parsed.data.locale, parsed.data.key]) : undefined;
}

function seamsOf(options: McpServerOptions): Omit<McpToolContext, "config"> {
  return {
    cwd: options.cwd,
    ...(options.fs !== undefined ? { fs: options.fs } : {}),
    ...(options.adapterRegistry !== undefined ? { adapterRegistry: options.adapterRegistry } : {}),
    ...(options.createProvider !== undefined ? { createProvider: options.createProvider } : {}),
  };
}

function toFailureResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: redact(message) }], isError: true };
}

function toOkResult(outcome: Extract<McpToolOutcome, { kind: "ok" }>): CallToolResult {
  const text = redact(JSON.stringify(outcome.result));
  return {
    content: [{ type: "text", text }],
    structuredContent: JSON.parse(text) as Record<string, unknown>,
  };
}

function toListedTool(tool: RegisteredMcpTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as unknown as Tool["inputSchema"],
    outputSchema: tool.outputSchema as unknown as Tool["outputSchema"],
    annotations: tool.annotations,
  };
}

function spendEnabled(allowSpend: boolean, state: McpProjectState): boolean {
  return (
    allowSpend && state.kind === "configured" && isMachineTranslationEnabled(state.loaded.config)
  );
}

function executeFor(
  tool: RegisteredMcpTool,
  params: unknown,
  state: McpProjectState,
  seams: Omit<McpToolContext, "config">,
  scope: McpCallScope,
): Promise<McpToolOutcome> {
  if (state.kind === "configured") {
    return tool.execute(params, { ...seams, ...scope, config: state.loaded });
  }
  if (tool.executeUnconfigured !== undefined) {
    return tool.executeUnconfigured(params, { ...seams, configError: state.error });
  }
  return Promise.resolve({
    kind: "error",
    message: describeUnconfiguredRefusal(tool.name, state.error, seams.cwd),
  });
}

interface ProgressChannel {
  readonly _meta?: { readonly progressToken?: string | number | undefined } | undefined;
  sendNotification(notification: ServerNotification): Promise<void>;
}

function progressReporterFor(
  channel: ProgressChannel,
  onLog: ((line: string) => void) | undefined,
): ProgressReporter | undefined {
  const progressToken = channel._meta?.progressToken;
  if (progressToken === undefined) {
    return undefined;
  }
  return createProgressReporter({
    send: (update) =>
      channel.sendNotification({
        method: "notifications/progress",
        params: { progressToken, ...update },
      }),
    ...(onLog !== undefined ? { onLog } : {}),
  });
}

export function createMcpServer(options: McpServerOptions): Server {
  const initial = options.project.latest();
  if (initial.kind === "configured") {
    declareProviderKeyEnvVar(initial.loaded.config.provider);
  }
  const manifest = readPackageManifest();
  const seams = seamsOf(options);
  const allowSpend = options.allowSpend ?? false;
  const inFlightGuard = createMcpInFlightGuard(GUARDED_TOOL_NAMES);
  let advertised: string | undefined;

  const server = new Server(
    { name: manifest.name, version: manifest.version },
    { capabilities: { tools: { listChanged: true } }, instructions: MCP_SERVER_INSTRUCTIONS },
  );

  function announceIfChanged(tools: readonly RegisteredMcpTool[]): void {
    const names = tools.map((tool) => tool.name).join(",");
    if (advertised !== undefined && advertised !== names) {
      server.sendToolListChanged().catch((error: unknown) => {
        options.onLog?.(redact(`Announcing the changed tool list failed: ${String(error)}`));
      });
    }
    advertised = names;
  }

  async function currentTools(): Promise<{
    readonly state: McpProjectState;
    readonly tools: readonly RegisteredMcpTool[];
  }> {
    const state = await options.project.current();
    const tools = buildToolRegistry(spendEnabled(allowSpend, state));
    return { state, tools };
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const { tools } = await currentTools();
    advertised = tools.map((tool) => tool.name).join(",");
    return { tools: tools.map(toListedTool) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { state, tools } = await currentTools();
    announceIfChanged(tools);
    const tool = tools.find((candidate) => candidate.name === request.params.name);
    if (tool === undefined) {
      options.onLog?.(redact(`Unknown tool requested: ${request.params.name}`));
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
    const dedupeKey = entryDedupeKey(request.params.arguments);
    if (inFlightGuard.tryEnter(tool.name, dedupeKey) === false) {
      options.onLog?.(redact(`Tool "${tool.name}" rejected: ${ALREADY_IN_PROGRESS_MESSAGE}`));
      return toFailureResult(ALREADY_IN_PROGRESS_MESSAGE);
    }
    const progress = progressReporterFor(extra, options.onLog);
    try {
      const scope: McpCallScope = progress !== undefined ? { onProgress: progress.onProgress } : {};
      const outcome = await executeFor(tool, request.params.arguments ?? {}, state, seams, scope);
      if (outcome.kind === "ok") {
        return toOkResult(outcome);
      }
      options.onLog?.(redact(`Tool "${tool.name}" ${outcome.kind}: ${outcome.message}`));
      return toFailureResult(outcome.message);
    } finally {
      progress?.close();
      inFlightGuard.leave(tool.name, dedupeKey);
    }
  });

  return server;
}

export async function connectMcpServer(
  options: McpServerOptions,
  transport: Transport,
): Promise<Server> {
  const server = createMcpServer(options);
  await server.connect(transport);
  return server;
}
