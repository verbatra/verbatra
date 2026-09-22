import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type CreateProvider, loadConfigWithMeta } from "@verbatra/sdk";
import { connectMcpServer } from "./server.js";
import type { McpToolContext } from "./types.js";

/** Everything {@link startMcpServer} accepts. Every field is optional. */
export interface StartMcpServerOptions {
  /**
   * The project root: where the config search starts, the base a relative `configPath` resolves
   * against, and the root every tool resolves project paths from. Defaults to `process.cwd()`.
   */
  readonly cwd?: string;
  /**
   * An explicit config file to load instead of searching for one. A path that does not exist fails
   * startup rather than falling back to the search.
   */
  readonly configPath?: string;
  /**
   * Whether to advertise the provider-spending tools, `translation.retranslateEntry` and
   * `translation.translatePending`. When off, the default, they are absent from the tool list and a
   * call to either is rejected as an unknown tool.
   */
  readonly allowSpend?: boolean;
  /**
   * File-system port the tools read and write the project through. Defaults to the real file
   * system. The config and its glossary file are loaded at startup from the real file system
   * regardless.
   */
  readonly fs?: McpToolContext["fs"];
  /** Format-adapter registry the tools resolve the configured format with. Defaults to the built-in registry. */
  readonly adapterRegistry?: McpToolContext["adapterRegistry"];
  /**
   * Builds the provider for the provider-spending tools. Defaults to the SDK constructing the
   * configured provider, which reads its API key from the environment.
   */
  readonly createProvider?: CreateProvider;
  /**
   * Receives one diagnostic line, already redacted, for each tool call that fails, is rejected
   * because a matching call is still in progress, or names an unknown tool. Never called for a
   * successful call. Omit it to discard them.
   */
  readonly onLog?: (line: string) => void;
}

/** A running MCP server, returned by {@link startMcpServer}. */
export interface McpServerHandle {
  /**
   * Stops the server and closes its stdio transport.
   *
   * @returns Resolves once the server is closed.
   */
  close(): Promise<void>;
}

/**
 * Starts verbatra's stdio MCP server: loads the project config, connects an MCP `Server` over
 * `process.stdin`/`process.stdout`, and returns a handle to stop it. Use this to embed the server
 * in your own process; the `verbatra mcp` CLI command and the `verbatra-mcp` binary both call it.
 *
 * Nothing but valid MCP protocol messages is ever written to stdout; pass `onLog` to receive
 * per-call diagnostics, which the caller is responsible for writing to stderr.
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
