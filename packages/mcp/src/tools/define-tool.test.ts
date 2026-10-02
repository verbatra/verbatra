import { AdapterError, errorHint, ProviderError, SdkError } from "@verbatra/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { makeContext } from "../test-support.js";
import { defineTool, McpInvalidParamsError } from "./define-tool.js";

const paramsSchema = z.strictObject({ name: z.string().min(1) });
const outputSchema = z.object({ greeting: z.string() });

describe("defineTool", () => {
  it("derives a draft-2020-12 JSON Schema input schema from the zod params schema", () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (params) => ({ greeting: `hi ${params.name}` }),
    });

    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it("derives a JSON Schema outputSchema and returns a result that conforms to it", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (params) => ({ greeting: `hi ${params.name}` }),
    });

    expect(tool.outputSchema.type).toBe("object");

    const outcome = await tool.execute({ name: "Ada" }, makeContext());
    expect(outcome).toEqual({ kind: "ok", result: { greeting: "hi Ada" } });
  });

  it("turns a handler result that breaks the outputSchema into an error naming the field, not its value", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => ({ greeting: 42 }) as unknown as { greeting: string },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext());

    expect(outcome).toEqual({
      kind: "error",
      message:
        'OUTPUT_SCHEMA_MISMATCH: the result of "test.tool" does not match its output schema at "greeting".',
    });
  });

  it("lets an added field through even a strictObject outputSchema, so no tool breaks on an SDK addition", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema: z.strictObject({ greeting: z.string() }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => ({ greeting: "hi", addedLater: true }) as { greeting: string },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext());

    expect(outcome).toEqual({ kind: "ok", result: { greeting: "hi", addedLater: true } });
    expect(tool.outputSchema).not.toHaveProperty("additionalProperties");
  });

  it("keeps additionalProperties false on the input schema", () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (params) => ({ greeting: `hi ${params.name}` }),
    });

    expect(tool.inputSchema.additionalProperties).toBe(false);
  });

  it("adds a do-not-retry note to a mismatch from a tool that writes", async () => {
    const tool = defineTool({
      name: "test.writer",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async () => ({ greeting: 42 }) as unknown as { greeting: string },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext());

    expect(outcome).toEqual({
      kind: "error",
      message:
        'OUTPUT_SCHEMA_MISMATCH: the result of "test.writer" does not match its output schema at "greeting". ' +
        "The call ran and its changes were applied; do not retry it, read the current state instead.",
    });
  });

  it("names a record's field by placeholder, never by its user-supplied key", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema: z.object({
        locales: z
          .array(z.object({ origins: z.record(z.string(), z.enum(["human"])).optional() }))
          .readonly(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () =>
        ({ locales: [{ origins: { "secret.key.name": "robot" } }] }) as unknown as {
          locales: readonly { origins?: Record<string, "human"> }[];
        },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext());

    expect(outcome).toEqual({
      kind: "error",
      message:
        'OUTPUT_SCHEMA_MISMATCH: the result of "test.tool" does not match its output schema at "locales.0.origins.<key>".',
    });
  });

  it("names the root when a handler result breaks the outputSchema at its top level", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => null as unknown as { greeting: string },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext());

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining('at "(root)"'),
    });
  });

  it("returns an isError-shaped outcome naming the offending field on invalid input", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (params) => ({ greeting: `hi ${params.name}` }),
    });

    const outcome = await tool.execute({ name: "" }, makeContext());
    expect(outcome.kind).toBe("invalid");
    expect(outcome).toMatchObject({ message: expect.stringContaining('"name"') });
  });

  it("treats a missing required field as invalid, naming the field", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (params) => ({ greeting: `hi ${params.name}` }),
    });

    const outcome = await tool.execute({}, makeContext());
    expect(outcome.kind).toBe("invalid");
    expect(outcome).toMatchObject({ message: expect.stringContaining('"name"') });
  });

  it("maps a thrown SdkError to an error outcome carrying its code and message", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        throw new SdkError("UNKNOWN_KEY", "no such key");
      },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext());
    expect(outcome).toEqual({
      kind: "error",
      message: `UNKNOWN_KEY: no such key\nNext step: ${errorHint({ code: "UNKNOWN_KEY" })}`,
    });
  });

  it.each([
    ["a ProviderError", new ProviderError("RATE_LIMITED", "slow down")],
    ["an AdapterError", new AdapterError("INVALID_STRUCTURE", "bad file")],
  ])("leads the message of %s with its code, like an SdkError", async (_label, error) => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      handler: async () => {
        throw error;
      },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext());
    expect(outcome).toEqual({
      kind: "error",
      message: `${error.code}: ${error.message}\nNext step: ${errorHint(error)}`,
    });
  });

  it("ends a failed construction's message with the key variable to set, never a key value", async () => {
    const sentinel = "sk-mcp-hint-sentinel-8c2e4a6f0b1d";
    vi.stubEnv("OPENAI_API_KEY", sentinel);
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      handler: async () => {
        throw new SdkError("PROVIDER_CONSTRUCTION_FAILED", "Failed to construct provider", {
          cause: new ProviderError("MISSING_API_KEY", "unset", { envVar: "GEMINI_API_KEY" }),
        });
      },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext());

    expect(outcome).toEqual({
      kind: "error",
      message:
        "PROVIDER_CONSTRUCTION_FAILED: Failed to construct provider\nNext step: Set GEMINI_API_KEY in the environment or in a .env file in the project directory.",
    });
    expect(JSON.stringify(outcome)).not.toContain(sentinel);
    vi.unstubAllEnvs();
  });

  it("maps an McpInvalidParamsError from the handler to an invalid outcome naming the field", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        throw new McpInvalidParamsError("cursor", "it no longer matches.");
      },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext());
    expect(outcome).toEqual({
      kind: "invalid",
      message: 'Invalid input for field "cursor": it no longer matches.',
    });
  });

  it("maps a thrown plain Error to an error outcome carrying its message", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        throw new Error("boom");
      },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext());
    expect(outcome).toEqual({ kind: "error", message: "boom" });
  });

  it("maps a thrown non-Error value to an error outcome via String()", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        throw "not an error object";
      },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext());
    expect(outcome).toEqual({ kind: "error", message: "not an error object" });
  });

  it("treats a missing arguments object as an empty object rather than throwing", async () => {
    const emptyParamsSchema = z.strictObject({});
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema: emptyParamsSchema,
      outputSchema: z.strictObject({ ok: z.boolean() }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => ({ ok: true }),
    });

    const outcome = await tool.execute(undefined, makeContext());
    expect(outcome).toEqual({ kind: "ok", result: { ok: true } });
  });

  it("relativizes a cwd-rooted absolute path in a thrown SdkError message", async () => {
    const cwd = "/Users/example/project";
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        throw new SdkError(
          "SOURCE_UNREADABLE",
          `The source locale file was not found at ${cwd}/locales/en.json.`,
        );
      },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext({ cwd }));

    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.message).not.toContain(cwd);
      expect(outcome.message).toContain("locales/en.json");
    }
  });

  it("relativizes a bare cwd occurrence with no trailing separator or subpath", async () => {
    const cwd = "/Users/example/project";
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        throw new SdkError("SOURCE_UNREADABLE", `The source directory does not exist: ${cwd}`);
      },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext({ cwd }));

    expect(outcome).toEqual({
      kind: "error",
      message: `SOURCE_UNREADABLE: The source directory does not exist: .\nNext step: ${errorHint({ code: "SOURCE_UNREADABLE" })}`,
    });
  });

  it("does not redact a longer path segment that merely starts with cwd", async () => {
    const cwd = "/Users/example/project";
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        throw new Error(`boom at ${cwd}-backup/locales/en.json`);
      },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext({ cwd }));

    expect(outcome).toEqual({
      kind: "error",
      message: `boom at ${cwd}-backup/locales/en.json`,
    });
  });

  it("leaves the error message untouched when cwd is empty", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        throw new Error("boom at /Users/example/project/locales/en.json");
      },
    });

    const outcome = await tool.execute({ name: "Ada" }, makeContext({ cwd: "" }));

    expect(outcome).toEqual({
      kind: "error",
      message: "boom at /Users/example/project/locales/en.json",
    });
  });

  it("names the root when a non-object argument fails validation, not a nested field", async () => {
    const tool = defineTool({
      name: "test.tool",
      values: "none",
      description: "test",
      paramsSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (params) => ({ greeting: `hi ${params.name}` }),
    });

    const outcome = await tool.execute("not an object", makeContext());
    expect(outcome).toMatchObject({ kind: "invalid", message: expect.stringContaining("(root)") });
  });
});
