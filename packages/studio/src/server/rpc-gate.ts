import { redact } from "@verbatra/sdk";
import type { z } from "zod";
import { RPC_METHOD_NAMES, type RpcMethodName, rpcParamsSchemas } from "../shared/rpc/contract.js";
import type { RpcInFlightGuard } from "./in-flight-guard.js";
import type { RpcRateLimiter } from "./rate-limiter.js";
import type { HandlersRegistry, RpcHandlerDeps } from "./rpc.js";

export interface RpcResult {
  readonly statusCode: number;
  readonly body: string;
}

const REQUEST_INVALID_MESSAGE = "The request body must be JSON shaped as { method, params }.";
const METHOD_UNKNOWN_MESSAGE = "The requested method is not recognized.";
const PARAMS_INVALID_MESSAGE = "The request parameters failed validation.";
const METHOD_RATE_LIMITED_MESSAGE = "Too many calls to this method; wait before retrying.";
const ALREADY_IN_PROGRESS_MESSAGE =
  "A matching call is already in progress; wait for it to finish.";
const INTERNAL_ERROR_MESSAGE = "An unexpected error occurred.";

interface ParsedIssue {
  readonly path: readonly string[];
  readonly code: string;
}

interface RawRequestShape {
  readonly method: string;
  readonly params: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequestShape(body: Buffer): RawRequestShape | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return undefined;
  }
  if (!isPlainObject(parsed)) {
    return undefined;
  }
  const method = parsed.method;
  if (typeof method !== "string") {
    return undefined;
  }
  return { method, params: parsed.params };
}

function isKnownMethod(method: string): method is RpcMethodName {
  return (RPC_METHOD_NAMES as readonly string[]).includes(method);
}

function toParsedIssues(error: z.ZodError): ParsedIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String), code: issue.code }));
}

function jsonEnvelope(statusCode: number, body: unknown): RpcResult {
  return { statusCode, body: JSON.stringify(body) };
}

function okEnvelope(result: unknown): RpcResult {
  return jsonEnvelope(200, { ok: true, result });
}

function errorEnvelope(
  statusCode: number,
  code: string,
  message: string,
  issues?: readonly ParsedIssue[],
): RpcResult {
  const error = issues === undefined ? { code, message } : { code, message, issues };
  return jsonEnvelope(statusCode, { ok: false, error });
}

interface DomainError {
  readonly code: string;
  readonly message: string;
}

function isDomainError(error: unknown): error is DomainError {
  return (
    error instanceof Error &&
    (error.name === "SdkError" ||
      error.name === "AdapterError" ||
      error.name === "ProviderError") &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

function mapHandlerError(error: unknown): RpcResult {
  if (isDomainError(error)) {
    return jsonEnvelope(200, {
      ok: false,
      error: { code: error.code, message: redact(error.message) },
    });
  }
  return errorEnvelope(500, "INTERNAL", INTERNAL_ERROR_MESSAGE);
}

async function invokeHandler(
  method: RpcMethodName,
  params: unknown,
  deps: RpcHandlerDeps,
  handlers: HandlersRegistry,
  rateLimiter: RpcRateLimiter | undefined,
  inFlightGuard: RpcInFlightGuard | undefined,
): Promise<RpcResult> {
  const schema = rpcParamsSchemas[method];
  const parsedParams = schema.safeParse(params);
  if (!parsedParams.success) {
    return errorEnvelope(
      400,
      "PARAMS_INVALID",
      PARAMS_INVALID_MESSAGE,
      toParsedIssues(parsedParams.error),
    );
  }
  const handler = handlers[method];
  if (handler === undefined) {
    return errorEnvelope(400, "METHOD_UNKNOWN", METHOD_UNKNOWN_MESSAGE);
  }
  if (rateLimiter?.tryAcquire(method) === false) {
    return errorEnvelope(429, "METHOD_RATE_LIMITED", METHOD_RATE_LIMITED_MESSAGE);
  }
  if (inFlightGuard?.tryEnter(method) === false) {
    return errorEnvelope(409, "ALREADY_IN_PROGRESS", ALREADY_IN_PROGRESS_MESSAGE);
  }
  try {
    const result = await handler(parsedParams.data as never, deps);
    return okEnvelope(result);
  } catch (error) {
    return mapHandlerError(error);
  } finally {
    inFlightGuard?.leave(method);
  }
}

export async function dispatchRpc(
  body: Buffer,
  deps: RpcHandlerDeps,
  handlers: HandlersRegistry,
  rateLimiter?: RpcRateLimiter,
  inFlightGuard?: RpcInFlightGuard,
): Promise<RpcResult> {
  const request = parseRequestShape(body);
  if (request === undefined) {
    return errorEnvelope(400, "REQUEST_INVALID", REQUEST_INVALID_MESSAGE);
  }
  if (!isKnownMethod(request.method)) {
    return errorEnvelope(400, "METHOD_UNKNOWN", METHOD_UNKNOWN_MESSAGE);
  }
  return invokeHandler(request.method, request.params, deps, handlers, rateLimiter, inFlightGuard);
}

export function handleRpcBody(
  body: Buffer,
  deps: RpcHandlerDeps,
  handlers: HandlersRegistry,
  rateLimiter?: RpcRateLimiter,
  inFlightGuard?: RpcInFlightGuard,
): Promise<RpcResult> {
  return dispatchRpc(body, deps, handlers, rateLimiter, inFlightGuard);
}
