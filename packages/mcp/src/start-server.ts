import type { Readable } from "node:stream";
import { type StdioServerHandle, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import {
  type CreateProvider,
  createValueMarker,
  isMachineTranslationEnabled,
  redact,
} from "@verbatra/sdk";
import { type McpProjectState, openProjectSession } from "./project-session.js";
import { serveMcpStdio } from "./server.js";
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
   * An explicit config file to load instead of searching for one. A path that does not exist at
   * startup fails startup rather than falling back to the search. A file that exists but is invalid,
   * or that is removed later, puts the server in unconfigured mode instead.
   */
  readonly configPath?: string;
  /**
   * Whether to advertise the provider-spending tools, `translation.retranslateEntry` and
   * `translation.translatePending`. When off, the default, they are absent from the tool list and a
   * call to either is rejected as an unknown tool. A config whose provider is `none` disables
   * machine translation by policy, and then they are absent even when this is on, as they are while
   * no usable config is loaded. It is fixed for the life of the server: a config change can hide
   * them, never add them when this is off.
   */
  readonly allowSpend?: boolean;
  /**
   * Whether every tool result replaces translation values with a marker,
   * `[redacted length=<n> hash=<h>]`, so no source text, translation, description, glossary term,
   * reviewer name, or commit author reaches the client. Key names, counts, statuses, origins,
   * integrity verdicts, commit subjects, and file paths stay. `review.approve` and `review.reject`
   * then take the marker's hash as `expectedHash`, valid for the life of this server only, and
   * `locale.values` refuses `query` and `key.context` refuses `draft`. Off by default. It changes
   * nothing a provider receives.
   */
  readonly redactValues?: boolean;
  /**
   * File-system port the server reads and writes the project through: the config's glossary file,
   * each time the config is loaded, and every file the tools touch. The config file itself is always
   * read, and checked for changes, on the real file system. Defaults to the real file system.
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
   * because a matching call is still in progress, or names an unknown tool, and one line each time
   * the project config is loaded again after a change or fails to load: at startup when the server
   * starts without a usable config, and whenever that error changes, and one line for each error on
   * the connection itself, such as a message that is not valid MCP. Never called for a successful
   * call. Omit it to discard them.
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
   * Whether the server advertised the provider-spending tools at startup, and why not: `off`
   * without `allowSpend`, `provider-none` when spending was allowed but the config's provider is
   * `none`, `no-config` when spending was allowed but no usable config was loaded.
   */
  readonly spend: McpSpendState;
  /** Whether the server replaces translation values with markers, see `redactValues`. */
  readonly valuesRedacted: boolean;
  /**
   * Whether a usable project config was loaded at startup. When `false` the server runs in
   * unconfigured mode: `project.snapshot` reports `configured: false`, `project.doctor` explains
   * what to fix, every other tool refuses with the config error, and the server loads the config on
   * the first call after it becomes valid, without a restart.
   */
  readonly configured: boolean;
}

/**
 * Starts verbatra's stdio MCP server: loads the project config, serves MCP over
 * `process.stdin`/`process.stdout` to clients on protocol revision 2026-07-28 and on the earlier
 * revisions back to 2024-10-07, and returns a handle to stop it. The server closes itself when
 * the client closes stdin, which settles the handle's `closed` promise. Use this to embed the server
 * in your own process; the `verbatra mcp` CLI command and the `verbatra-mcp` binary both call it.
 *
 * A missing or invalid config does not stop the server: it starts in unconfigured mode (see
 * {@link McpServerHandle.configured}). Before each request it checks whether the config file, any
 * file the config search would find, or the glossary file changed, and loads the config again when
 * one did, so an edit takes effect without a restart. A call already running keeps the config it
 * started with.
 *
 * Nothing but valid MCP protocol messages is ever written to stdout; pass `onLog` to receive
 * per-call diagnostics, which the caller is responsible for writing to stderr.
 *
 * @param options - Where to resolve the project from, whether provider-spending tools are
 * advertised, whether values are redacted, and optional dependency injection seams.
 * @returns A handle whose `close()` stops the server and releases the stdio transport.
 *
 * @throws {@link SdkError} `CONFIG_NOT_FOUND`: the explicit `configPath` does not exist at startup.
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
  const valueMarker = options.redactValues === true ? createValueMarker() : undefined;
  const project = await openProjectSession({
    cwd,
    ...(options.configPath !== undefined ? { configPath: options.configPath } : {}),
    ...(options.fs !== undefined ? { fs: options.fs } : {}),
    ...(options.onLog !== undefined ? { onLog: options.onLog } : {}),
    ...(valueMarker !== undefined ? { valueMarker } : {}),
  });
  const initial = project.latest();

  const input = process.stdin;
  const transport = new StdioServerTransport(input, process.stdout);
  const handle = serveMcpStdio(
    {
      project,
      cwd,
      allowSpend: options.allowSpend ?? false,
      ...(valueMarker !== undefined ? { valueMarker } : {}),
      ...(options.fs !== undefined ? { fs: options.fs } : {}),
      ...(options.adapterRegistry !== undefined
        ? { adapterRegistry: options.adapterRegistry }
        : {}),
      ...(options.createProvider !== undefined ? { createProvider: options.createProvider } : {}),
      ...(options.onLog !== undefined ? { onLog: options.onLog } : {}),
    },
    transport,
  );

  const connection = stdioConnection(handle, transport);
  const closed = closeOnInputEnd(input, connection, options.onLog);
  return {
    close: () => connection.close(),
    closed,
    spend: spendState(options.allowSpend ?? false, initial),
    valuesRedacted: options.redactValues ?? false,
    configured: initial.kind === "configured",
  };
}

function spendState(allowSpend: boolean, state: McpProjectState): McpSpendState {
  if (!allowSpend) {
    return "off";
  }
  if (state.kind === "unconfigured") {
    return "no-config";
  }
  return isMachineTranslationEnabled(state.loaded.config) ? "on" : "provider-none";
}

interface ClosableServer {
  close(): Promise<void>;
  onclose?: (() => void) | undefined;
}

function stdioConnection(
  handle: StdioServerHandle,
  transport: StdioServerTransport,
): ClosableServer {
  const connection: ClosableServer = { close: () => handle.close() };
  const transportOnClose = transport.onclose;
  transport.onclose = () => {
    transportOnClose?.();
    connection.onclose?.();
  };
  return connection;
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
