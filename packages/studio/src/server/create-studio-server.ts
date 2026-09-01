import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { fileURLToPath } from "node:url";
import type { LoadedConfig } from "@verbatra/sdk";
import { EDIT_ENTRY_METHOD } from "../shared/rpc/edit-entry.js";
import { GLOSSARY_WRITE_METHOD } from "../shared/rpc/glossary.js";
import { RETRANSLATE_ENTRY_METHOD } from "../shared/rpc/retranslate-entry.js";
import { TRANSLATE_PENDING_METHOD } from "../shared/rpc/translate-pending.js";
import { buildBanner } from "./banner.js";
import { cookieName } from "./cookie.js";
import { resolvePort } from "./default-port.js";
import { type DispatchContext, handleRequest } from "./dispatch.js";
import { StudioServerStartError } from "./errors.js";
import { createRpcInFlightGuard, type RpcInFlightGuard } from "./in-flight-guard.js";
import { createRpcRateLimiter, type RpcRateLimiter } from "./rate-limiter.js";
import { resolveBoundAddress } from "./resolve-bound-port.js";
import { createRpcHandlers, type RpcHandlerDeps, type StudioCapabilities } from "./rpc.js";
import { createSseHub, type SseHub } from "./sse.js";
import { generateToken } from "./token.js";
import { FORBIDDEN_BODY } from "./transport-responses.js";
import type { StudioServer, StudioServerOptions } from "./types.js";
import {
  createProjectWatcher,
  defaultCreateStudioWatcher,
  type ProjectWatcher,
} from "./watcher.js";

const DEFAULT_RETRANSLATE_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RETRANSLATE_RATE_LIMIT_MAX = 20;
const DEFAULT_EDIT_ENTRY_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_EDIT_ENTRY_RATE_LIMIT_MAX = 20;
const DEFAULT_TRANSLATE_PENDING_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_TRANSLATE_PENDING_RATE_LIMIT_MAX = 5;
const DEFAULT_GLOSSARY_WRITE_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_GLOSSARY_WRITE_RATE_LIMIT_MAX = 20;

function buildRateLimiter(options: StudioServerOptions): RpcRateLimiter {
  return createRpcRateLimiter({
    [RETRANSLATE_ENTRY_METHOD]: {
      windowMs: options.retranslateRateLimitWindowMs ?? DEFAULT_RETRANSLATE_RATE_LIMIT_WINDOW_MS,
      maxCalls: options.retranslateRateLimitMax ?? DEFAULT_RETRANSLATE_RATE_LIMIT_MAX,
    },
    [EDIT_ENTRY_METHOD]: {
      windowMs: options.editEntryRateLimitWindowMs ?? DEFAULT_EDIT_ENTRY_RATE_LIMIT_WINDOW_MS,
      maxCalls: options.editEntryRateLimitMax ?? DEFAULT_EDIT_ENTRY_RATE_LIMIT_MAX,
    },
    [TRANSLATE_PENDING_METHOD]: {
      windowMs:
        options.translatePendingRateLimitWindowMs ?? DEFAULT_TRANSLATE_PENDING_RATE_LIMIT_WINDOW_MS,
      maxCalls: options.translatePendingRateLimitMax ?? DEFAULT_TRANSLATE_PENDING_RATE_LIMIT_MAX,
    },
    [GLOSSARY_WRITE_METHOD]: {
      windowMs:
        options.glossaryWriteRateLimitWindowMs ?? DEFAULT_GLOSSARY_WRITE_RATE_LIMIT_WINDOW_MS,
      maxCalls: options.glossaryWriteRateLimitMax ?? DEFAULT_GLOSSARY_WRITE_RATE_LIMIT_MAX,
    },
  });
}

function buildInFlightGuard(): RpcInFlightGuard {
  return createRpcInFlightGuard(
    new Set([TRANSLATE_PENDING_METHOD, RETRANSLATE_ENTRY_METHOD, EDIT_ENTRY_METHOD]),
  );
}

const RAW_FORBIDDEN_RESPONSE = [
  "HTTP/1.1 403 Forbidden",
  "Content-Type: text/plain; charset=utf-8",
  `Content-Length: ${Buffer.byteLength(FORBIDDEN_BODY)}`,
  "Connection: close",
  "",
  FORBIDDEN_BODY,
].join("\r\n");

function handleClientError(_error: Error, socket: Socket): void {
  if (socket.writable) {
    socket.end(RAW_FORBIDDEN_RESPONSE);
  } else {
    socket.destroy();
  }
}

function defaultAssetsRoot(): URL {
  return new URL("./app/", import.meta.url);
}

function defaultOutput(line: string): void {
  console.log(line);
}

function buildRpcHandlerDeps(
  config: LoadedConfig,
  projectRoot: string,
  capabilities: StudioCapabilities,
  exposeAgentTools: boolean,
  options: StudioServerOptions,
): RpcHandlerDeps {
  return {
    config,
    projectRoot,
    spend: capabilities.spend,
    exposeAgentTools,
    ...(options.fs !== undefined ? { fs: options.fs } : {}),
    ...(options.adapterRegistry !== undefined ? { adapterRegistry: options.adapterRegistry } : {}),
    ...(options.execFileImpl !== undefined ? { execFileImpl: options.execFileImpl } : {}),
    ...(options.createWatcher !== undefined ? { createWatcher: options.createWatcher } : {}),
    ...(options.heartbeatIntervalMs !== undefined
      ? { heartbeatIntervalMs: options.heartbeatIntervalMs }
      : {}),
    ...(options.createProvider !== undefined ? { createProvider: options.createProvider } : {}),
  };
}

export function assertLoopbackAddress(address: AddressInfo): void {
  if (address.address !== "127.0.0.1") {
    throw new StudioServerStartError(
      "BIND_FAILED",
      address.port,
      "verbatra studio server did not bind to 127.0.0.1",
    );
  }
}

function listen(server: Server, port: number): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(new StudioServerStartError("PORT_IN_USE", port, `port ${port} is already in use`));
        return;
      }
      /* v8 ignore next -- other bind failures (for example EACCES on a privileged port) are OS and environment dependent and not reliably reproducible in a test */
      reject(error);
    });
    server.listen(port, "127.0.0.1", () => {
      /* v8 ignore next 5 -- server.address() is only null or a pipe path before listen resolves or after close; neither applies inside this callback */
      try {
        resolve(resolveBoundAddress(server.address()));
      } catch (error) {
        reject(error);
      }
    });
  });
}

const SHUTDOWN_FLUSH_GRACE_MS = 50;

async function closeServer(server: Server, sseHub: SseHub, watcher: ProjectWatcher): Promise<void> {
  sseHub.closeAll();
  await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_FLUSH_GRACE_MS));
  const serverClosed = new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
  await Promise.all([serverClosed, watcher.close()]);
}

/**
 * Starts the local Verbatra Studio server: a loopback-only HTTP server that serves the prebuilt
 * dashboard and gates every request behind a Host and Origin check, a bootstrap token, and a
 * session cookie. There is no host option and no relaxed mode. The entry URL printed once at
 * startup carries the token and is the only supported way in.
 *
 * Use it to open a dashboard over a verbatra project from your own tooling; the verbatra CLI's
 * `studio` command is a thin caller of exactly this function. The returned server keeps running
 * until {@link StudioServer.close} is called.
 *
 * Two orderings matter. Capabilities are fixed first: `writeToDisk` is always on, and provider
 * calls are allowed only when {@link StudioServerDeps.spend} is set, so nothing the project's own
 * config module does can widen what this process was granted. Then `options.loader` resolves,
 * exactly once, before the server listens; every RPC handler reuses that one config for the life of
 * the process.
 *
 * @param options - The loader, where to bind and run, the granted capabilities, and any injection seams.
 * @returns The running server: its loopback URL, the port actually bound, and a `close` to stop it.
 * @throws {@link StudioServerStartError} `PORT_IN_USE`: the requested port is already held by
 *   another process.
 * @throws {@link StudioServerStartError} `BIND_FAILED`: the socket bound to an address other than
 *   `127.0.0.1`, which would expose the dashboard beyond this machine.
 * @throws Whatever `options.loader` rejects with, unchanged, when the project config cannot be
 *   loaded. The server is not started in that case.
 *
 * @example
 * ```ts
 * import { loadConfigWithMeta } from "@verbatra/sdk";
 * import { startStudioServer } from "@verbatra/studio";
 *
 * const server = await startStudioServer({
 *   loader: () => loadConfigWithMeta({ cwd: process.cwd() }),
 *   cwd: process.cwd(),
 *   port: 0,
 * });
 *
 * console.log(`Studio bound to port ${server.port}`);
 * await server.close();
 * ```
 */
export async function startStudioServer(options: StudioServerOptions): Promise<StudioServer> {
  const assetsRootPath = fileURLToPath(options.assetsRoot ?? defaultAssetsRoot());
  const output = options.output ?? defaultOutput;
  const token = options.token ?? generateToken();
  const capabilities: StudioCapabilities = {
    spend: options.spend ?? false,
    writeToDisk: true,
  };
  const exposeAgentTools = options.exposeAgentTools ?? false;
  const config = await options.loader();
  const projectRoot = options.cwd ?? process.cwd();

  const watcher = await createProjectWatcher(
    { config: config.config, projectRoot },
    {
      createWatcher: options.createWatcher ?? defaultCreateStudioWatcher,
      ...(options.fs !== undefined ? { fs: options.fs } : {}),
      ...(options.adapterRegistry !== undefined
        ? { adapterRegistry: options.adapterRegistry }
        : {}),
    },
  );
  const sseHub = createSseHub(
    options.heartbeatIntervalMs !== undefined
      ? { heartbeatIntervalMs: options.heartbeatIntervalMs }
      : {},
  );
  watcher.onRefresh((event) => sseHub.broadcastRefresh(event));

  const handlers = createRpcHandlers(capabilities);
  const rateLimiter = buildRateLimiter(options);
  const inFlightGuard = buildInFlightGuard();

  const server = createServer();
  server.on("clientError", handleClientError);
  const address = await listen(server, resolvePort(options.port));
  assertLoopbackAddress(address);
  const port = address.port;

  const context: DispatchContext = {
    port,
    token,
    cookieName: cookieName(port),
    assetsRootPath,
    log: output,
    rpcDeps: buildRpcHandlerDeps(config, projectRoot, capabilities, exposeAgentTools, options),
    handlers,
    rateLimiter,
    inFlightGuard,
    sseHub,
  };
  server.on("request", (request, response) => {
    handleRequest(context, request, response).catch(() => {
      request.destroy();
      response.destroy();
    });
  });

  const url = `http://127.0.0.1:${port}/`;
  output(buildBanner(url, token));

  return {
    url,
    port,
    close: () => closeServer(server, sseHub, watcher),
  };
}
