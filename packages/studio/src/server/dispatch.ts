import type { IncomingMessage, ServerResponse } from "node:http";
import { BODY_CAP_BYTES, PayloadTooLargeError, readBodyWithCap } from "./body-reader.js";
import { contentTypeFor } from "./content-type.js";
import { buildSetCookieHeader, readCookieValue } from "./cookie.js";
import { isAllowedHost, isAllowedOrigin } from "./host-origin.js";
import type { RpcInFlightGuard } from "./in-flight-guard.js";
import type { RpcRateLimiter } from "./rate-limiter.js";
import { isJsonRequestContentType } from "./request-content-type.js";
import { formatRequestLog } from "./request-log.js";
import type { HandlersRegistry, RpcHandlerDeps } from "./rpc.js";
import { handleRpcBody } from "./rpc-gate.js";
import { applyNoStore, applySecurityHeaders } from "./security-headers.js";
import type { SseHub } from "./sse.js";
import { readAsset } from "./static-assets.js";
import { tokensMatch } from "./token.js";
import {
  FORBIDDEN_BODY,
  METHOD_NOT_ALLOWED_BODY,
  NOT_FOUND_BODY,
  PAYLOAD_TOO_LARGE_BODY,
  sendConstantResponse,
  UNAUTHORIZED_BODY,
  UNSUPPORTED_MEDIA_TYPE_BODY,
} from "./transport-responses.js";

export interface DispatchContext {
  readonly port: number;
  readonly token: string;
  readonly cookieName: string;
  readonly assetsRootPath: string;
  readonly log: (line: string) => void;
  readonly rpcDeps: RpcHandlerDeps;
  readonly handlers: HandlersRegistry;
  readonly rateLimiter: RpcRateLimiter;
  readonly inFlightGuard: RpcInFlightGuard;
  readonly sseHub: SseHub;
}

const EVENTS_PATH = "/events";

function pathWithoutQuery(url: string): string {
  const index = url.indexOf("?");
  return index === -1 ? url : url.slice(0, index);
}

function extractBootstrapToken(url: string): string | undefined {
  const index = url.indexOf("?");
  if (index === -1) {
    return undefined;
  }
  const params = new URLSearchParams(url.slice(index + 1));
  return params.has("token") ? (params.get("token") ?? "") : undefined;
}

function isAuthenticated(context: DispatchContext, request: IncomingMessage): boolean {
  const cookieValue = readCookieValue(request.headers.cookie, context.cookieName);
  return cookieValue !== undefined && tokensMatch(cookieValue, context.token);
}

function finishConstant(
  context: DispatchContext,
  response: ServerResponse,
  method: string,
  path: string,
  status: number,
  body: string,
): void {
  sendConstantResponse(response, status, body);
  context.log(formatRequestLog({ method, path, status }));
}

function sendRedirectToRoot(
  context: DispatchContext,
  response: ServerResponse,
  method: string,
  path: string,
): void {
  applyNoStore(response);
  response.statusCode = 303;
  response.setHeader("Location", "/");
  response.end();
  context.log(formatRequestLog({ method, path, status: 303 }));
}

function handleBootstrap(
  context: DispatchContext,
  response: ServerResponse,
  method: string,
  path: string,
  candidate: string,
): void {
  if (!tokensMatch(candidate, context.token)) {
    finishConstant(context, response, method, path, 401, UNAUTHORIZED_BODY);
    return;
  }
  response.setHeader("Set-Cookie", buildSetCookieHeader(context.cookieName, context.token));
  sendRedirectToRoot(context, response, method, path);
}

async function serveStatic(
  context: DispatchContext,
  response: ServerResponse,
  method: string,
  path: string,
): Promise<void> {
  const asset =
    (await readAsset(context.assetsRootPath, path)) ??
    (await readAsset(context.assetsRootPath, "/index.html"));
  if (asset === undefined) {
    finishConstant(context, response, method, path, 404, NOT_FOUND_BODY);
    return;
  }
  const contentType = contentTypeFor(asset.path);
  if (contentType.startsWith("text/html")) {
    applyNoStore(response);
  }
  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.end(asset.body);
  context.log(formatRequestLog({ method, path, status: 200 }));
}

function handleEvents(
  context: DispatchContext,
  response: ServerResponse,
  method: string,
  path: string,
): void {
  applyNoStore(response);
  response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });
  response.write(": connected\n\n");
  context.sseHub.register(response);
  context.log(formatRequestLog({ method, path, status: 200 }));
}

async function handleGet(
  context: DispatchContext,
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  path: string,
): Promise<void> {
  const bootstrapToken = path === "/" ? extractBootstrapToken(request.url ?? "/") : undefined;
  if (bootstrapToken !== undefined) {
    handleBootstrap(context, response, method, path, bootstrapToken);
    return;
  }
  if (!isAuthenticated(context, request)) {
    finishConstant(context, response, method, path, 401, UNAUTHORIZED_BODY);
    return;
  }
  if (path === EVENTS_PATH) {
    handleEvents(context, response, method, path);
    return;
  }
  await serveStatic(context, response, method, path);
}

async function readRpcBody(
  context: DispatchContext,
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  path: string,
): Promise<Buffer | undefined> {
  try {
    return await readBodyWithCap(request, BODY_CAP_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      finishConstant(context, response, method, path, 413, PAYLOAD_TOO_LARGE_BODY);
      return undefined;
    }
    throw error;
  }
}

async function handlePost(
  context: DispatchContext,
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  path: string,
): Promise<void> {
  if (!isAllowedOrigin(request.headers.origin, context.port)) {
    finishConstant(context, response, method, path, 403, FORBIDDEN_BODY);
    return;
  }
  if (path !== "/rpc") {
    finishConstant(context, response, method, path, 404, NOT_FOUND_BODY);
    return;
  }
  if (!isAuthenticated(context, request)) {
    finishConstant(context, response, method, path, 401, UNAUTHORIZED_BODY);
    return;
  }
  if (!isJsonRequestContentType(request.headers["content-type"])) {
    finishConstant(context, response, method, path, 415, UNSUPPORTED_MEDIA_TYPE_BODY);
    return;
  }
  const body = await readRpcBody(context, request, response, method, path);
  if (body === undefined) {
    return;
  }
  const result = await handleRpcBody(
    body,
    context.rpcDeps,
    context.handlers,
    context.rateLimiter,
    context.inFlightGuard,
  );
  applyNoStore(response);
  response.statusCode = result.statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (result.retryAfterSeconds !== undefined) {
    response.setHeader("Retry-After", String(result.retryAfterSeconds));
  }
  response.end(result.body);
  context.log(
    formatRequestLog({ method, path, status: result.statusCode, rpcMethod: result.rpcMethod }),
  );
}

export async function handleRequest(
  context: DispatchContext,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  const path = pathWithoutQuery(request.url ?? "/");

  applySecurityHeaders(response);

  if (!isAllowedHost(request.headers.host, context.port)) {
    finishConstant(context, response, method, path, 403, FORBIDDEN_BODY);
    return;
  }
  if (method === "OPTIONS") {
    finishConstant(context, response, method, path, 403, FORBIDDEN_BODY);
    return;
  }
  if (method === "GET") {
    await handleGet(context, request, response, method, path);
    return;
  }
  if (method === "POST") {
    await handlePost(context, request, response, method, path);
    return;
  }
  finishConstant(context, response, method, path, 405, METHOD_NOT_ALLOWED_BODY);
}
