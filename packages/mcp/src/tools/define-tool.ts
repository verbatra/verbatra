import {
  AdapterError,
  errorHint,
  ProviderError,
  projectRelativeMessage,
  SdkError,
} from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { describeIssuePath } from "./issue-path.js";

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
  execute(rawParams: unknown, context: McpToolContext): Promise<McpToolOutcome>;
}

export interface McpToolConfig<Params, Result extends Readonly<Record<string, unknown>>> {
  readonly name: string;
  readonly description: string;
  readonly paramsSchema: z.ZodType<Params>;
  readonly outputSchema: z.ZodObject & z.ZodType<Result>;
  readonly annotations: McpToolAnnotations;
  readonly handler: (params: Params, context: McpToolContext) => Promise<Result>;
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

function outputMismatch(schema: z.ZodType, result: unknown): z.core.$ZodIssue | undefined {
  const parsed = schema.safeParse(result);
  if (parsed.success) {
    return undefined;
  }
  return parsed.error.issues.find((issue) => issue.code !== "unrecognized_keys");
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

function describeToolError(error: unknown, cwd: string): string {
  const described = projectRelativeMessage(rawErrorMessage(error), cwd);
  const hint = errorHint(error);
  return hint === undefined ? described : `${described}\nNext step: ${hint}`;
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
    async execute(rawParams, context) {
      const parsed = config.paramsSchema.safeParse(rawParams ?? {});
      if (!parsed.success) {
        return {
          kind: "invalid",
          message: formatValidationError(config.paramsSchema, parsed.error),
        };
      }
      let result: Result;
      try {
        result = await config.handler(parsed.data, context);
      } catch (error) {
        return { kind: "error", message: describeToolError(error, context.cwd) };
      }
      const mismatch = outputMismatch(config.outputSchema, result);
      if (mismatch !== undefined) {
        return { kind: "error", message: formatOutputMismatch(config, mismatch) };
      }
      return { kind: "ok", result };
    },
  };
}
