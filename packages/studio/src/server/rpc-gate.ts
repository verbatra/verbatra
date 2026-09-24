import { redact } from "@verbatra/sdk";
import { z } from "zod";
import { RPC_METHOD_NAMES, type RpcMethodName, rpcParamsSchemas } from "../shared/rpc/contract.js";
import { entryIdentity, uniqueByIdentity } from "../shared/rpc/entry-identity.js";
import { causeText, studioErrorLine } from "./error-line.js";
import type { InFlightEntryRef, RpcInFlightGuard } from "./in-flight-guard.js";
import type { RpcRateLimiter } from "./rate-limiter.js";
import type { HandlersRegistry, RpcHandlerDeps } from "./rpc.js";

export interface RpcResult {
  readonly statusCode: number;
  readonly body: string;
  readonly retryAfterSeconds?: number;
}

const REQUEST_INVALID_MESSAGE = "The request body must be JSON shaped as { method, params }.";
const METHOD_UNKNOWN_MESSAGE = "The requested method is not recognized.";
const PARAMS_INVALID_MESSAGE = "The request parameters failed validation.";
const METHOD_RATE_LIMITED_MESSAGE = "Too many calls to this method; wait before retrying.";
const BATCH_TOO_LARGE_MESSAGE =
  "This batch has more entries than this method allows in one rate-limit window; send fewer entries.";
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

const entryDedupeParamsSchema = z.object({ locale: z.string(), key: z.string() });

function entryDedupeKey(params: unknown): string | undefined {
  const parsed = entryDedupeParamsSchema.safeParse(params);
  return parsed.success ? entryIdentity(parsed.data) : undefined;
}

const batchEntryRefsSchema = z.object({ entries: z.array(entryDedupeParamsSchema) });

function uniqueEntryRefs(entries: readonly InFlightEntryRef[]): readonly InFlightEntryRef[] {
  return uniqueByIdentity(entries).map((entry) => ({ locale: entry.locale, key: entry.key }));
}

function batchEntryRefs(params: unknown): readonly InFlightEntryRef[] | undefined {
  const batch = batchEntryRefsSchema.safeParse(params);
  return batch.success ? uniqueEntryRefs(batch.data.entries) : undefined;
}

function requestEntryRefs(params: unknown): readonly InFlightEntryRef[] {
  const single = entryDedupeParamsSchema.safeParse(params);
  if (single.success) {
    return [{ locale: single.data.locale, key: single.data.key }];
  }
  return batchEntryRefs(params) ?? [];
}

function requestWeight(params: unknown): number {
  return batchEntryRefs(params)?.length ?? 1;
}

function rateLimitRefusal(
  rateLimiter: RpcRateLimiter | undefined,
  method: string,
  weight: number,
): RpcResult | undefined {
  if (rateLimiter === undefined) {
    return undefined;
  }
  if (rateLimiter.exceedsWindow(method, weight)) {
    return errorEnvelope(429, "BATCH_TOO_LARGE", BATCH_TOO_LARGE_MESSAGE);
  }
  return rateLimiter.tryAcquire(method, weight)
    ? undefined
    : rateLimitedEnvelope(rateLimiter.retryAfterMs(method, weight));
}

function rateLimitedEnvelope(retryAfterMs: number): RpcResult {
  const retryAfterSeconds = Math.max(0, Math.ceil(retryAfterMs / 1000));
  const error = {
    code: "METHOD_RATE_LIMITED",
    message: METHOD_RATE_LIMITED_MESSAGE,
    retryAfterSeconds,
  };
  return { ...jsonEnvelope(429, { ok: false, error }), retryAfterSeconds };
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

function mapHandlerError(error: unknown, method: RpcMethodName, deps: RpcHandlerDeps): RpcResult {
  if (isDomainError(error)) {
    return jsonEnvelope(200, {
      ok: false,
      error: { code: error.code, message: redact(error.message) },
    });
  }
  deps.log?.(studioErrorLine(`${method} failed: ${causeText(error)}`));
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
  const dedupeKey = entryDedupeKey(parsedParams.data);
  if (inFlightGuard?.tryEnter(method, dedupeKey, requestEntryRefs(parsedParams.data)) === false) {
    return errorEnvelope(409, "ALREADY_IN_PROGRESS", ALREADY_IN_PROGRESS_MESSAGE);
  }
  const refusal = rateLimitRefusal(rateLimiter, method, requestWeight(parsedParams.data));
  if (refusal !== undefined) {
    inFlightGuard?.leave(method, dedupeKey);
    return refusal;
  }
  try {
    const result = await handler(parsedParams.data as never, deps);
    return okEnvelope(result);
  } catch (error) {
    return mapHandlerError(error, method, deps);
  } finally {
    inFlightGuard?.leave(method, dedupeKey);
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
