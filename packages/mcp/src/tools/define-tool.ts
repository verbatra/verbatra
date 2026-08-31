import { SdkError } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";

export interface McpToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

export type McpToolOutcome =
  | { readonly kind: "ok"; readonly result: unknown; readonly structuredContent?: unknown }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

export interface RegisteredMcpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema?: Readonly<Record<string, unknown>>;
  readonly annotations: McpToolAnnotations;
  execute(rawParams: unknown, context: McpToolContext): Promise<McpToolOutcome>;
}

export interface McpToolConfig<Params, Result> {
  readonly name: string;
  readonly description: string;
  readonly paramsSchema: z.ZodType<Params>;
  readonly outputSchema?: z.ZodType<Result>;
  readonly annotations: McpToolAnnotations;
  readonly handler: (params: Params, context: McpToolContext) => Promise<Result>;
}

function formatValidationError(error: z.ZodError): string {
  const issue = error.issues[0];
  /* v8 ignore next 3 -- a ZodError from a failed safeParse always carries at least one issue. */
  if (issue === undefined) {
    return "Invalid input.";
  }
  const field = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  return `Invalid input for field "${field}": ${issue.message}`;
}

function describeToolError(error: unknown): string {
  if (error instanceof SdkError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function defineTool<Params, Result>(
  config: McpToolConfig<Params, Result>,
): RegisteredMcpTool {
  const inputSchema = z.toJSONSchema(config.paramsSchema) as Readonly<Record<string, unknown>>;
  const outputSchema =
    config.outputSchema !== undefined
      ? (z.toJSONSchema(config.outputSchema) as Readonly<Record<string, unknown>>)
      : undefined;

  return {
    name: config.name,
    description: config.description,
    inputSchema,
    ...(outputSchema !== undefined ? { outputSchema } : {}),
    annotations: config.annotations,
    async execute(rawParams, context) {
      const parsed = config.paramsSchema.safeParse(rawParams ?? {});
      if (!parsed.success) {
        return { kind: "invalid", message: formatValidationError(parsed.error) };
      }
      try {
        const result = await config.handler(parsed.data, context);
        return {
          kind: "ok",
          result,
          ...(config.outputSchema !== undefined ? { structuredContent: result } : {}),
        };
      } catch (error) {
        return { kind: "error", message: describeToolError(error) };
      }
    },
  };
}
