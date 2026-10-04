import {
  type CallToolResult,
  type Notification,
  ProtocolError,
  ProtocolErrorCode,
  Server,
  type Tool,
  type Transport,
} from "@modelcontextprotocol/server";
import { type StdioServerHandle, serveStdio } from "@modelcontextprotocol/server/stdio";
import { declareProviderKeyEnvVar, isMachineTranslationEnabled, redact } from "@verbatra/sdk";
import { z } from "zod";
import { readPackageManifest } from "./package-manifest.js";
import { createProgressReporter, type ProgressReporter } from "./progress-reporter.js";
import type { McpProjectState } from "./project-session.js";
import { serverInstructions } from "./server-instructions.js";
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
    ...(options.valueMarker !== undefined ? { valueMarker: options.valueMarker } : {}),
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
    message: describeUnconfiguredRefusal(tool.name, state.error, seams.cwd, seams.valueMarker),
  });
}

interface ProgressChannel {
  readonly mcpReq: {
    readonly _meta?: { readonly progressToken?: string | number | undefined } | undefined;
    readonly signal: AbortSignal;
    notify(notification: Notification): Promise<void>;
  };
}

function progressReporterFor(
  channel: ProgressChannel,
  onLog: ((line: string) => void) | undefined,
): ProgressReporter | undefined {
  const progressToken = channel.mcpReq._meta?.progressToken;
  if (progressToken === undefined) {
    return undefined;
  }
  return createProgressReporter({
    send: (update) =>
      channel.mcpReq.notify({
        method: "notifications/progress",
        params: { progressToken, ...update },
      }),
    signal: channel.mcpReq.signal,
    ...(onLog !== undefined ? { onLog } : {}),
  });
}

function callScope(signal: AbortSignal, progress: ProgressReporter | undefined): McpCallScope {
  return { signal, ...(progress !== undefined ? { onProgress: progress.onProgress } : {}) };
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
    {
      capabilities: { tools: { listChanged: true } },
      instructions: serverInstructions({ valuesRedacted: options.valueMarker !== undefined }),
    },
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

  server.setRequestHandler("tools/list", async () => {
    const { tools } = await currentTools();
    advertised = tools.map((tool) => tool.name).join(",");
    return { tools: tools.map(toListedTool) };
  });

  server.setRequestHandler("tools/call", async (request, ctx) => {
    const { state, tools } = await currentTools();
    announceIfChanged(tools);
    const tool = tools.find((candidate) => candidate.name === request.params.name);
    if (tool === undefined) {
      options.onLog?.(redact(`Unknown tool requested: ${request.params.name}`));
      throw new ProtocolError(
        ProtocolErrorCode.MethodNotFound,
        `Unknown tool: ${request.params.name}`,
      );
    }
    const dedupeKey = entryDedupeKey(request.params.arguments);
    if (inFlightGuard.tryEnter(tool.name, dedupeKey) === false) {
      options.onLog?.(redact(`Tool "${tool.name}" rejected: ${ALREADY_IN_PROGRESS_MESSAGE}`));
      return toFailureResult(ALREADY_IN_PROGRESS_MESSAGE);
    }
    const progress = progressReporterFor(ctx, options.onLog);
    try {
      const scope = callScope(ctx.mcpReq.signal, progress);
      const outcome = await executeFor(tool, request.params.arguments ?? {}, state, seams, scope);
      if (outcome.kind === "ok") {
        return toOkResult(outcome);
      }
      options.onLog?.(redact(`Tool "${tool.name}" ${outcome.kind}: ${outcome.message}`));
      return toFailureResult(outcome.message);
    } finally {
      progress?.close();
      inFlightGuard.leave(tool.name, dedupeKey);
      if (ctx.mcpReq.signal.aborted) {
        options.onLog?.(redact(`Tool "${tool.name}" cancelled by the client; no result was sent.`));
      }
    }
  });

  return server;
}

export function serveMcpStdio(options: McpServerOptions, transport: Transport): StdioServerHandle {
  const { onLog } = options;
  return serveStdio(() => createMcpServer(options), {
    legacy: "serve",
    transport,
    ...(onLog !== undefined
      ? { onerror: (error: Error) => onLog(redact(`MCP connection error: ${error.message}`)) }
      : {}),
  });
}
