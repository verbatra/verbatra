import type { Readable } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  type CreateProvider,
  isMachineTranslationEnabled,
  loadConfigWithMeta,
  redact,
  type VerbatraConfig,
} from "@verbatra/sdk";
import { connectMcpServer } from "./server.js";
import { resolveServerCwd } from "./server-cwd.js";
import type { McpSpendState } from "./session-banner.js";
import type { McpToolContext } from "./types.js";

/** Everything {@link startMcpServer} accepts. Every field is optional. */
export interface StartMcpServerOptions {
  /**
   * The project root: where the config search starts, the base a relative `configPath` resolves
   * against, and the root every tool resolves project paths from. Defaults to the
   * `CLAUDE_PROJECT_DIR` environment variable when it names an existing directory, else
   * `process.cwd()` (see {@link resolveServerCwd}).
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
   * call to either is rejected as an unknown tool. A config whose provider is `none` disables
   * machine translation by policy, and then they are absent even when this is on.
   */
  readonly allowSpend?: boolean;
  /**
   * File-system port the server reads and writes the project through: the config's glossary file
   * at startup and every file the tools touch afterwards. The config file itself is always read
   * from the real file system. Defaults to the real file system.
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
  /**
   * Settles once the server has closed, whether through `close()` or because the client closed
   * stdin. Also settles when closing the server after stdin ended fails; that failure is reported
   * through `onLog`. Never rejects.
   */
  readonly closed: Promise<void>;
  /**
   * Whether the server advertises the provider-spending tools, and why not: `off` without
   * `allowSpend`, `provider-none` when spending was allowed but the config's provider is `none`.
   */
  readonly spend: McpSpendState;
}

/**
 * Starts verbatra's stdio MCP server: loads the project config, connects an MCP `Server` over
 * `process.stdin`/`process.stdout`, and returns a handle to stop it. The server closes itself when
 * the client closes stdin, which settles the handle's `closed` promise. Use this to embed the server
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
  const cwd = resolveServerCwd(options.cwd);
  const loaded = await loadConfigWithMeta({
    cwd,
    ...(options.configPath !== undefined ? { configPath: options.configPath } : {}),
    ...(options.fs !== undefined ? { fs: options.fs } : {}),
  });

  const input = process.stdin;
  const transport = new StdioServerTransport(input, process.stdout);
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

  const closed = closeOnInputEnd(input, server, options.onLog);
  return {
    close: () => server.close(),
    closed,
    spend: spendState(options.allowSpend ?? false, loaded.config),
  };
}

function spendState(allowSpend: boolean, config: VerbatraConfig): McpSpendState {
  if (!allowSpend) {
    return "off";
  }
  return isMachineTranslationEnabled(config) ? "on" : "provider-none";
}

interface ClosableServer {
  close(): Promise<void>;
  onclose?: (() => void) | undefined;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function closeOnInputEnd(
  input: Readable,
  server: ClosableServer,
  onLog?: (line: string) => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const detach = (): void => {
      input.off("end", closeServer);
      input.off("close", closeServer);
    };
    const closeServer = (): void => {
      detach();
      server.close().catch((error: unknown) => {
        onLog?.(redact(`Closing the server after stdin ended failed: ${describeError(error)}`));
        resolve();
      });
    };
    const previousOnClose = server.onclose;
    server.onclose = () => {
      detach();
      previousOnClose?.();
      resolve();
    };
    input.once("end", closeServer);
    input.once("close", closeServer);
  });
}
