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
import { readPackageManifest } from "./package-manifest.js";
import type { McpToolOutcome } from "./tools/define-tool.js";
import { buildToolRegistry } from "./tools/registry.js";
import type { McpServerOptions, McpToolContext } from "./types.js";

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
    const outcome = await tool.execute(request.params.arguments ?? {}, context);
    if (outcome.kind === "ok") {
      return toOkResult(outcome);
    }
    options.onLog?.(redact(`Tool "${tool.name}" ${outcome.kind}: ${outcome.message}`));
    return toFailureResult(outcome.message);
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
