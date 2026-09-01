import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type CreateProvider, loadConfigWithMeta } from "@verbatra/sdk";
import { connectMcpServer } from "./server.js";
import type { McpToolContext } from "./types.js";

export interface StartMcpServerOptions {
  readonly cwd?: string;
  readonly configPath?: string;
  readonly allowSpend?: boolean;
  readonly fs?: McpToolContext["fs"];
  readonly adapterRegistry?: McpToolContext["adapterRegistry"];
  readonly createProvider?: CreateProvider;
  readonly onLog?: (line: string) => void;
}

export interface McpServerHandle {
  close(): Promise<void>;
}

/**
 * Starts verbatra's stdio MCP server: loads the project config, connects an MCP `Server` over
 * `process.stdin`/`process.stdout`, and returns a handle to stop it. Use this to embed the server
 * in your own process; the `verbatra mcp` CLI command and the `verbatra-mcp` binary both call it.
 *
 * Nothing but valid MCP protocol messages is ever written to stdout; pass `onLog` to receive
 * startup and per-call diagnostics, which the caller is responsible for writing to stderr.
 *
 * @param options - Where to resolve the project from, whether provider-spending tools are
 * advertised, and optional dependency injection seams.
 * @returns A handle whose `close()` stops the server and releases the stdio transport.
 *
 * @throws {@link SdkError} `CONFIG_NOT_FOUND`: no config was found by search, or the explicit
 * `configPath` does not exist.
 * @throws {@link SdkError} `CONFIG_INVALID`: the config could not be loaded or fails validation, or
 * its glossary file is missing, oversized, not UTF-8, not valid JSON, or not a flat string map.
 *
 * @example
 * ```ts
 * import { startMcpServer } from "@verbatra/mcp";
 *
 * const handle = await startMcpServer({ cwd: process.cwd(), allowSpend: false });
 * process.on("SIGINT", () => void handle.close());
 * ```
 */
export async function startMcpServer(
  options: StartMcpServerOptions = {},
): Promise<McpServerHandle> {
  const cwd = options.cwd ?? process.cwd();
  const loaded = await loadConfigWithMeta({
    cwd,
    ...(options.configPath !== undefined ? { configPath: options.configPath } : {}),
  });

  const transport = new StdioServerTransport();
  const server = await connectMcpServer(
    {
      config: loaded,
      cwd,
      allowSpend: options.allowSpend ?? false,
      ...(options.fs !== undefined ? { fs: options.fs } : {}),
      ...(options.adapterRegistry !== undefined
        ? { adapterRegistry: options.adapterRegistry }
        : {}),
      ...(options.createProvider !== undefined ? { createProvider: options.createProvider } : {}),
      ...(options.onLog !== undefined ? { onLog: options.onLog } : {}),
    },
    transport,
  );

  return {
    close: () => server.close(),
  };
}
