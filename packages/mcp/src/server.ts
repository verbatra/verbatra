import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { redact } from "@verbatra/sdk";
import { z } from "zod";
import { readPackageManifest } from "./package-manifest.js";
import type { McpToolOutcome } from "./tools/define-tool.js";
import { editEntryTool } from "./tools/edit-entry.js";
import { createMcpInFlightGuard } from "./tools/in-flight-guard.js";
import { buildToolRegistry } from "./tools/registry.js";
import { retranslateEntryTool } from "./tools/retranslate-entry.js";
import type { McpServerOptions, McpToolContext } from "./types.js";

const GUARDED_TOOL_NAMES: ReadonlySet<string> = new Set([
  retranslateEntryTool.name,
  editEntryTool.name,
]);

const ALREADY_IN_PROGRESS_MESSAGE =
  "A matching call is already in progress; wait for it to finish.";

const entryDedupeParamsSchema = z.object({ locale: z.string(), key: z.string() });

function entryDedupeKey(params: unknown): string | undefined {
  const parsed = entryDedupeParamsSchema.safeParse(params);
  return parsed.success ? JSON.stringify([parsed.data.locale, parsed.data.key]) : undefined;
}

function buildContext(options: McpServerOptions): McpToolContext {
  return {
    config: options.config,
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
  const content: CallToolResult["content"] = [{ type: "text", text }];
  if (outcome.structuredContent !== undefined) {
    return { content, structuredContent: JSON.parse(text) as Record<string, unknown> };
  }
  return { content };
}

export function createMcpServer(options: McpServerOptions): Server {
  const manifest = readPackageManifest();
  const context = buildContext(options);
  const tools = buildToolRegistry(options.allowSpend ?? false);
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool] as const));
  const inFlightGuard = createMcpInFlightGuard(GUARDED_TOOL_NAMES);

  const server = new Server(
    { name: manifest.name, version: manifest.version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(
      (tool): Tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as unknown as Tool["inputSchema"],
        ...(tool.outputSchema !== undefined
          ? { outputSchema: tool.outputSchema as unknown as Tool["outputSchema"] }
          : {}),
        annotations: tool.annotations,
      }),
    ),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolsByName.get(request.params.name);
    if (tool === undefined) {
      options.onLog?.(redact(`Unknown tool requested: ${request.params.name}`));
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
    const dedupeKey = entryDedupeKey(request.params.arguments);
    if (inFlightGuard.tryEnter(tool.name, dedupeKey) === false) {
      options.onLog?.(redact(`Tool "${tool.name}" rejected: ${ALREADY_IN_PROGRESS_MESSAGE}`));
      return toFailureResult(ALREADY_IN_PROGRESS_MESSAGE);
    }
    try {
      const outcome = await tool.execute(request.params.arguments ?? {}, context);
      if (outcome.kind === "ok") {
        return toOkResult(outcome);
      }
      options.onLog?.(redact(`Tool "${tool.name}" ${outcome.kind}: ${outcome.message}`));
      return toFailureResult(outcome.message);
    } finally {
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
