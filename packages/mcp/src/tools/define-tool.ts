import {
  AdapterError,
  errorHint,
  ProviderError,
  projectRelativeMessage,
  SdkError,
  type ValueMarker,
} from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolCallContext, McpUnconfiguredContext } from "../types.js";
import { describeIssuePath } from "./issue-path.js";
import { carriesValues } from "./value-redaction.js";

export class McpInvalidParamsError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`Invalid input for field "${field}": ${message}`);
    this.name = "McpInvalidParamsError";
    this.field = field;
  }
}

export interface McpToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

export type McpToolOutcome =
  | { readonly kind: "ok"; readonly result: object }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

export interface RegisteredMcpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly annotations: McpToolAnnotations;
  execute(rawParams: unknown, context: McpToolCallContext): Promise<McpToolOutcome>;
  executeUnconfigured?(
    rawParams: unknown,
    context: McpUnconfiguredContext,
  ): Promise<McpToolOutcome>;
}

export interface ValueRedaction<Params, Result> {
  readonly redact: (result: Result, marker: ValueMarker) => Result;
  readonly refusedParams?: readonly (keyof Params & string)[];
}

export interface McpToolConfig<Params, Result extends Readonly<Record<string, unknown>>> {
  readonly name: string;
  readonly values: "none" | ValueRedaction<Params, Result>;
  readonly description: string;
  readonly paramsSchema: z.ZodType<Params>;
  readonly outputSchema: z.ZodObject & z.ZodType<Result>;
  readonly annotations: McpToolAnnotations;
  readonly handler: (params: Params, context: McpToolCallContext) => Promise<Result>;
  readonly unconfiguredHandler?: (
    params: Params,
    context: McpUnconfiguredContext,
  ) => Promise<Result>;
}

function formatValidationError(schema: z.ZodType, error: z.ZodError): string {
  const issue = error.issues[0];
  /* v8 ignore next 3 -- a ZodError from a failed safeParse always carries at least one issue. */
  if (issue === undefined) {
    return "Invalid input.";
  }
  return `Invalid input for field "${describeIssuePath(schema, issue)}": ${issue.message}`;
}

function allowUnknownProperties(context: {
  readonly jsonSchema: { additionalProperties?: unknown };
}): void {
  if (context.jsonSchema.additionalProperties === false) {
    delete context.jsonSchema.additionalProperties;
  }
}

type OutputCheck<Result> =
  | { readonly kind: "declared"; readonly declared: Result }
  | { readonly kind: "undeclared-keys"; readonly issue: z.core.$ZodIssue }
  | { readonly kind: "mismatch"; readonly issue: z.core.$ZodIssue };

function checkOutput<Result>(schema: z.ZodType<Result>, result: Result): OutputCheck<Result> {
  const parsed = schema.safeParse(result);
  if (parsed.success) {
    return { kind: "declared", declared: parsed.data };
  }
  const issues = parsed.error.issues;
  const mismatch = issues.find((issue) => issue.code !== "unrecognized_keys");
  return mismatch === undefined
    ? { kind: "undeclared-keys", issue: issues[0] as z.core.$ZodIssue }
    : { kind: "mismatch", issue: mismatch };
}

function formatOutputMismatch(
  config: {
    readonly name: string;
    readonly outputSchema: z.ZodType;
    readonly annotations: McpToolAnnotations;
  },
  issue: z.core.$ZodIssue,
): string {
  const at = describeIssuePath(config.outputSchema, issue);
  const mismatch = `OUTPUT_SCHEMA_MISMATCH: the result of "${config.name}" does not match its output schema at "${at}".`;
  if (config.annotations.readOnlyHint) {
    return mismatch;
  }
  return `${mismatch} The call ran and its changes were applied; do not retry it, read the current state instead.`;
}

function rawErrorMessage(error: unknown): string {
  if (
    error instanceof SdkError ||
    error instanceof ProviderError ||
    error instanceof AdapterError
  ) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function describeErrorMessage(error: unknown, cwd: string, marker?: ValueMarker): string {
  if (marker !== undefined && carriesValues(error)) {
    return `${error.code}: ${marker.mark(projectRelativeMessage(error.message, cwd))}`;
  }
  return projectRelativeMessage(rawErrorMessage(error), cwd);
}

export function describeToolError(error: unknown, cwd: string, marker?: ValueMarker): string {
  const described = describeErrorMessage(error, cwd, marker);
  const hint = errorHint(error);
  return hint === undefined ? described : `${described}\nNext step: ${hint}`;
}

function refusedParam<Params, Result>(
  values: "none" | ValueRedaction<Params, Result>,
  params: Params,
): string | undefined {
  if (values === "none") {
    return undefined;
  }
  return values.refusedParams?.find((name) => params[name] !== undefined);
}

function refusedParamMessage(field: string): string {
  return `Invalid input for field "${field}": this server redacts translation values, so "${field}" is not accepted. Leave it out.`;
}

function finishResult<Params, Result extends Readonly<Record<string, unknown>>>(
  config: McpToolConfig<Params, Result>,
  result: Result,
  marker: ValueMarker | undefined,
): McpToolOutcome {
  const check = checkOutput(config.outputSchema, result);
  if (check.kind === "mismatch" || (check.kind === "undeclared-keys" && marker !== undefined)) {
    return { kind: "error", message: formatOutputMismatch(config, check.issue) };
  }
  if (marker === undefined || check.kind !== "declared") {
    return { kind: "ok", result };
  }
  const declared = check.declared;
  return {
    kind: "ok",
    result: config.values === "none" ? declared : config.values.redact(declared, marker),
  };
}

const WITHHELD_PROVIDER_MESSAGE =
  "the provider's message is withheld because this server redacts translation values";

function describeFailure(
  error: unknown,
  context: { readonly cwd: string; readonly valueMarker?: ValueMarker },
): string {
  if (context.valueMarker !== undefined && error instanceof ProviderError) {
    const hint = errorHint(error);
    const described = `${error.code}: ${WITHHELD_PROVIDER_MESSAGE}.`;
    return hint === undefined ? described : `${described}\nNext step: ${hint}`;
  }
  return describeToolError(error, context.cwd, context.valueMarker);
}

function createExecutor<
  Params,
  Result extends Readonly<Record<string, unknown>>,
  Context extends { readonly cwd: string; readonly valueMarker?: ValueMarker },
>(
  config: McpToolConfig<Params, Result>,
  handler: (params: Params, context: Context) => Promise<Result>,
): (rawParams: unknown, context: Context) => Promise<McpToolOutcome> {
  return async (rawParams, context) => {
    const parsed = config.paramsSchema.safeParse(rawParams ?? {});
    if (!parsed.success) {
      return {
        kind: "invalid",
        message: formatValidationError(config.paramsSchema, parsed.error),
      };
    }
    const refused =
      context.valueMarker === undefined ? undefined : refusedParam(config.values, parsed.data);
    if (refused !== undefined) {
      return { kind: "invalid", message: refusedParamMessage(refused) };
    }
    let result: Result;
    try {
      result = await handler(parsed.data, context);
    } catch (error) {
      if (error instanceof McpInvalidParamsError) {
        return { kind: "invalid", message: error.message };
      }
      return { kind: "error", message: describeFailure(error, context) };
    }
    return finishResult(config, result, context.valueMarker);
  };
}

export function defineTool<Params, Result extends Readonly<Record<string, unknown>>>(
  config: McpToolConfig<Params, Result>,
): RegisteredMcpTool {
  const inputSchema = z.toJSONSchema(config.paramsSchema) as Readonly<Record<string, unknown>>;
  const outputSchema = z.toJSONSchema(config.outputSchema, {
    override: allowUnknownProperties,
  }) as Readonly<Record<string, unknown>>;

  return {
    name: config.name,
    description: config.description,
    inputSchema,
    outputSchema,
    annotations: config.annotations,
    execute: createExecutor(config, config.handler),
    ...(config.unconfiguredHandler !== undefined
      ? { executeUnconfigured: createExecutor(config, config.unconfiguredHandler) }
      : {}),
  };
}
