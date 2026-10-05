import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { RpcCallResult, RpcClient } from "../client/rpc-client.js";
import { RPC_METHOD_NAMES, type RpcMethodName, rpcParamsSchemas } from "../shared/rpc/contract.js";
import { agentEditEntryParamsSchema } from "../shared/rpc/edit-entry.js";
import { HUMAN_ONLY_METHOD_NAMES } from "../shared/rpc/human-only.js";
import {
  agentLocaleValuesParamsSchema,
  LOCALE_VALUES_PAGE_LIMIT_CAP,
  LOCALE_VALUES_PAGE_LIMIT_DEFAULT,
} from "../shared/rpc/locale-values.js";
import { agentRetranslateEntryParamsSchema } from "../shared/rpc/retranslate-entry.js";
import { agentReviewDecisionParamsSchema } from "../shared/rpc/review-decision.js";
import type { ProjectSnapshotResult } from "../shared/rpc/snapshot.js";
import { type ModelContext, registerAgentTools, type WebMcpTool } from "./register-tools.js";
import type { AgentToolsRegistration } from "./registration-report.js";

interface RecordedCall {
  readonly method: string;
  readonly params: unknown;
}

const HUMAN_ONLY: ReadonlySet<string> = new Set(HUMAN_ONLY_METHOD_NAMES);

const AGENT_METHOD_NAMES = RPC_METHOD_NAMES.filter((method) => !HUMAN_ONLY.has(method));

const READ_TOOLS = [
  "project.snapshot",
  "status.check",
  "status.diff",
  "glossary.get",
  "lock.state",
  "history.list",
  "key.integrity",
  "review.queue",
  "usage.summary",
  "key.value",
  "locale.values",
  "locale.integrity",
  "key.context",
  "translation.estimate",
] as const;

const WRITE_AND_SPEND_TOOLS = [
  "translation.editEntry",
  "glossary.write",
  "review.approve",
  "review.reject",
  "translation.retranslateEntry",
  "translation.translatePending",
] as const;

const SPEND_TOOLS = ["translation.retranslateEntry", "translation.translatePending"] as const;

const UNTRUSTED_TOOLS = [
  "status.diff",
  "glossary.get",
  "history.list",
  "key.integrity",
  "review.queue",
  "key.value",
  "locale.values",
  "locale.integrity",
  "key.context",
  "translation.editEntry",
  "translation.retranslateEntry",
  "translation.translatePending",
  "translation.estimate",
  "glossary.write",
  "review.approve",
  "review.reject",
] as const;

const TEXT_FREE_TOOLS = [
  "project.snapshot",
  "status.check",
  "lock.state",
  "usage.summary",
] as const;

function makeSnapshotResult(overrides: Partial<ProjectSnapshotResult> = {}): ProjectSnapshotResult {
  return {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "anthropic" },
    configSource: "override",
    glossary: { source: "none" },
    capabilities: { spend: false, writeToDisk: true },
    exposeAgentTools: true,
    ...overrides,
  };
}

function makeRpcClient(
  snapshot: RpcCallResult<"project.snapshot">,
  calls: RecordedCall[],
): RpcClient {
  const call = async (method: string, params: unknown): Promise<unknown> => {
    calls.push({ method, params });
    if (method === "project.snapshot") {
      return snapshot;
    }
    return { ok: true, result: { echoed: method } };
  };
  return { call } as RpcClient;
}

function makeModelContext(): { context: ModelContext; tools: WebMcpTool[] } {
  const tools: WebMcpTool[] = [];
  return {
    context: {
      registerTool: (tool) => {
        tools.push(tool);
      },
    },
    tools,
  };
}

function toolByName(tools: readonly WebMcpTool[], name: string): WebMcpTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) {
    throw new Error(`tool not registered: ${name}`);
  }
  return tool;
}

function expectedName(method: string): string {
  return `verbatra_${method.replaceAll(".", "_")}`;
}

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function makeThrowingModelContext(refused: string): { context: ModelContext; tools: WebMcpTool[] } {
  const tools: WebMcpTool[] = [];
  return {
    context: {
      registerTool: (tool): void => {
        if (tool.name === refused) {
          throw namedError("SecurityError", "registration refused");
        }
        tools.push(tool);
      },
    },
    tools,
  };
}

function makeRejectingModelContext(refused: string): {
  context: ModelContext;
  tools: WebMcpTool[];
} {
  const tools: WebMcpTool[] = [];
  return {
    context: {
      registerTool: (tool): Promise<void> => {
        if (tool.name === refused) {
          return Promise.reject(namedError("SecurityError", "registration refused"));
        }
        tools.push(tool);
        return Promise.resolve();
      },
    },
    tools,
  };
}

function makeDuplicateRejectingModelContext(): { context: ModelContext; tools: WebMcpTool[] } {
  const tools: WebMcpTool[] = [];
  return {
    context: {
      registerTool: (tool): Promise<void> => {
        if (tools.some((registered) => registered.name === tool.name)) {
          return Promise.reject(namedError("InvalidStateError", "tool name already registered"));
        }
        tools.push(tool);
        return Promise.resolve();
      },
    },
    tools,
  };
}

async function registerWith(
  snapshot: RpcCallResult<"project.snapshot">,
): Promise<{ tools: WebMcpTool[]; calls: RecordedCall[]; registration: AgentToolsRegistration }> {
  const calls: RecordedCall[] = [];
  const { context, tools } = makeModelContext();
  const rpcClient = makeRpcClient(snapshot, calls);
  const registration = await registerAgentTools({
    modelContext: context,
    rpcClient,
    schemas: rpcParamsSchemas,
  });
  return { tools, calls, registration };
}

async function registerWithContext(
  snapshot: RpcCallResult<"project.snapshot">,
  context: ModelContext,
): Promise<AgentToolsRegistration> {
  return registerAgentTools({
    modelContext: context,
    rpcClient: makeRpcClient(snapshot, []),
    schemas: rpcParamsSchemas,
  });
}

const SNAPSHOT_ON: RpcCallResult<"project.snapshot"> = {
  ok: true,
  result: makeSnapshotResult({ exposeAgentTools: true }),
};

const SNAPSHOT_ON_WITH_SPEND: RpcCallResult<"project.snapshot"> = {
  ok: true,
  result: makeSnapshotResult({
    exposeAgentTools: true,
    capabilities: { spend: true, writeToDisk: true },
  }),
};

describe("registerAgentTools no-ops", () => {
  it("registers nothing and never calls the rpc client when modelContext is absent", async () => {
    const calls: RecordedCall[] = [];
    const rpcClient = makeRpcClient(SNAPSHOT_ON, calls);

    await registerAgentTools({ modelContext: undefined, rpcClient, schemas: rpcParamsSchemas });

    expect(calls).toHaveLength(0);
  });

  it("registers nothing when the snapshot call fails", async () => {
    const { tools } = await registerWith({
      ok: false,
      error: { code: "SESSION_EXPIRED", message: "gone" },
    });

    expect(tools).toHaveLength(0);
  });

  it("registers nothing when exposeAgentTools is false", async () => {
    const { tools, calls } = await registerWith({
      ok: true,
      result: makeSnapshotResult({ exposeAgentTools: false }),
    });

    expect(tools).toHaveLength(0);
    expect(calls).toEqual([{ method: "project.snapshot", params: {} }]);
  });
});

describe("registerAgentTools registration set", () => {
  it("registers the fourteen read tools and the four unpriced write tools, but no spend tool, when spend is false", async () => {
    const { tools } = await registerWith(SNAPSHOT_ON);
    const names = tools.map((tool) => tool.name);

    expect(tools).toHaveLength(18);
    for (const name of READ_TOOLS) {
      expect(names).toContain(expectedName(name));
    }
    expect(names).toContain(expectedName("translation.editEntry"));
    expect(names).toContain(expectedName("glossary.write"));
    expect(names).toContain(expectedName("review.approve"));
    expect(names).toContain(expectedName("review.reject"));
    for (const name of SPEND_TOOLS) {
      expect(names).not.toContain(expectedName(name));
    }
  });

  it("registers all twenty tools when spend is true", async () => {
    const { tools } = await registerWith(SNAPSHOT_ON_WITH_SPEND);
    const names = tools.map((tool) => tool.name);

    expect(tools).toHaveLength(20);
    for (const name of [...READ_TOOLS, ...WRITE_AND_SPEND_TOOLS]) {
      expect(names).toContain(expectedName(name));
    }
  });

  it("names every tool with the MCP-safe verbatra_ prefix and no dot", async () => {
    const { tools } = await registerWith(SNAPSHOT_ON_WITH_SPEND);
    const names = tools.map((tool) => tool.name);

    expect(names).toContain("verbatra_project_snapshot");
    expect(names).toContain("verbatra_key_value");
    expect(names).toContain("verbatra_translation_editEntry");
    expect(names).toContain("verbatra_translation_retranslateEntry");
    for (const name of names) {
      expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }
  });
});

describe("registerAgentTools annotations and input schema", () => {
  it("sets readOnlyHint and untrustedContentHint exactly as mapped", async () => {
    const { tools } = await registerWith(SNAPSHOT_ON_WITH_SPEND);

    for (const name of READ_TOOLS) {
      expect(toolByName(tools, expectedName(name)).annotations?.readOnlyHint).toBe(true);
    }
    for (const name of WRITE_AND_SPEND_TOOLS) {
      expect(toolByName(tools, expectedName(name)).annotations?.readOnlyHint).toBe(false);
    }
    for (const name of UNTRUSTED_TOOLS) {
      expect(toolByName(tools, expectedName(name)).annotations?.untrustedContentHint).toBe(true);
    }
    for (const name of TEXT_FREE_TOOLS) {
      expect(
        toolByName(tools, expectedName(name)).annotations?.untrustedContentHint,
      ).toBeUndefined();
    }
  });

  it("derives each tool's inputSchema from the injected params schema", async () => {
    const { tools } = await registerWith(SNAPSHOT_ON_WITH_SPEND);

    expect(toolByName(tools, expectedName("key.value")).inputSchema).toEqual(
      z.toJSONSchema(rpcParamsSchemas["key.value"]),
    );
    expect(toolByName(tools, expectedName("project.snapshot")).inputSchema).toEqual(
      z.toJSONSchema(rpcParamsSchemas["project.snapshot"]),
    );
  });
});

describe("registerAgentTools registration report", () => {
  it("reports every attempted tool as registered when the surface accepts them all", async () => {
    const { registration } = await registerWith(SNAPSHOT_ON);

    expect(registration.attempted).toBe(18);
    expect(registration.registered).toHaveLength(18);
    expect(registration.failures).toEqual([]);
  });

  it("counts the two spend tools among the attempts once spend is granted", async () => {
    const { registration } = await registerWith(SNAPSHOT_ON_WITH_SPEND);

    expect(registration.attempted).toBe(20);
    expect(registration.failures).toEqual([]);
  });

  it("reports nothing attempted when the pass no-ops", async () => {
    const calls: RecordedCall[] = [];
    const withoutSurface = await registerAgentTools({
      modelContext: undefined,
      rpcClient: makeRpcClient(SNAPSHOT_ON, calls),
      schemas: rpcParamsSchemas,
    });
    const { registration: withoutOptIn } = await registerWith({
      ok: true,
      result: makeSnapshotResult({ exposeAgentTools: false }),
    });

    for (const registration of [withoutSurface, withoutOptIn]) {
      expect(registration).toEqual({ attempted: 0, registered: [], failures: [] });
    }
  });
});

describe("registerAgentTools failure reporting", () => {
  it("reports a synchronous throw and still registers every tool after it", async () => {
    const refused = expectedName("status.diff");
    const { context, tools } = makeThrowingModelContext(refused);

    const registration = await registerWithContext(SNAPSHOT_ON, context);
    const registeredNames = tools.map((tool) => tool.name);

    expect(registration.attempted).toBe(18);
    expect(registration.registered).toHaveLength(17);
    expect(registration.failures).toEqual([
      { tool: refused, errorName: "SecurityError", message: "registration refused" },
    ]);
    expect(registeredNames).not.toContain(refused);
    expect(registeredNames).toContain(expectedName("key.value"));
    expect(registeredNames).toContain(expectedName("translation.editEntry"));
  });

  it("reports a rejected registration and leaves no unhandled rejection behind", async () => {
    const refused = expectedName("status.diff");
    const { context, tools } = makeRejectingModelContext(refused);
    const escaped: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      escaped.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const registration = await registerWithContext(SNAPSHOT_ON, context);
      await new Promise((resolve) => setImmediate(resolve));

      expect(escaped).toEqual([]);
      expect(registration.failures).toEqual([
        { tool: refused, errorName: "SecurityError", message: "registration refused" },
      ]);
      expect(registration.registered).toHaveLength(17);
      expect(tools.map((tool) => tool.name)).toContain(expectedName("key.value"));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("catches a duplicate registration as an InvalidStateError rather than letting it escape", async () => {
    const { context, tools } = makeDuplicateRejectingModelContext();

    const first = await registerWithContext(SNAPSHOT_ON, context);
    const second = await registerWithContext(SNAPSHOT_ON, context);

    expect(first.failures).toEqual([]);
    expect(first.registered).toHaveLength(18);
    expect(second.registered).toEqual([]);
    expect(second.failures).toHaveLength(18);
    expect(new Set(second.failures.map((failure) => failure.errorName))).toEqual(
      new Set(["InvalidStateError"]),
    );
    expect(second.failures.map((failure) => failure.tool)).toContain(
      expectedName("project.snapshot"),
    );
    expect(tools).toHaveLength(18);
  });
});

const MINIMUM_SENTENCES = 3;

function sentencesOf(description: string): readonly string[] {
  return description.split(/(?<=\.)\s+/).filter((sentence) => sentence.length > 0);
}

function backtickedTokens(description: string): Set<string> {
  return new Set(Array.from(description.matchAll(/`([^`]+)`/g), (match) => match[1] ?? ""));
}

function schemaParamNames(method: RpcMethodName): Set<string> {
  const agentSchemas: Partial<Record<RpcMethodName, z.ZodType>> = {
    "translation.editEntry": agentEditEntryParamsSchema,
    "translation.retranslateEntry": agentRetranslateEntryParamsSchema,
    "review.approve": agentReviewDecisionParamsSchema,
    "review.reject": agentReviewDecisionParamsSchema,
    "locale.values": agentLocaleValuesParamsSchema,
  };
  const agentSchema = agentSchemas[method] ?? rpcParamsSchemas[method];
  const schema = z.toJSONSchema(agentSchema) as {
    readonly properties?: Readonly<Record<string, unknown>>;
  };
  return new Set(Object.keys(schema.properties ?? {}));
}

async function describedTools(): Promise<ReadonlyMap<RpcMethodName, string>> {
  const { tools } = await registerWith(SNAPSHOT_ON_WITH_SPEND);
  return new Map(
    AGENT_METHOD_NAMES.map((method) => [
      method,
      toolByName(tools, expectedName(method)).description,
    ]),
  );
}

describe("registerAgentTools: review decisions stay with a person", () => {
  it("registers no batch method, so a batch decision or a batch spend stays with a person", async () => {
    const { tools } = await registerWith(SNAPSHOT_ON_WITH_SPEND);
    const names = tools.map((tool) => tool.name);

    expect(names).not.toContain("verbatra_review_approveMany");
    expect(names).not.toContain("verbatra_review_rejectMany");
    expect(names).not.toContain("verbatra_translation_retranslateEntries");
  });

  it("registers approve and reject for one entry, with a reviewer the agent must name", async () => {
    const { tools, registration } = await registerWith(SNAPSHOT_ON_WITH_SPEND);
    const names = tools.map((tool) => tool.name);

    expect(names).toContain("verbatra_review_approve");
    expect(names).toContain("verbatra_review_reject");
    expect(names).not.toContain("verbatra_review_approveLocale");
    expect(names).toHaveLength(RPC_METHOD_NAMES.length - HUMAN_ONLY_METHOD_NAMES.length);
    expect(registration.attempted).toBe(names.length);
    for (const name of ["verbatra_review_approve", "verbatra_review_reject"]) {
      expect(toolByName(tools, name).inputSchema).toMatchObject({
        required: ["locale", "key", "expectedValue", "reviewer"],
      });
    }
  });
});

describe("registerAgentTools tool descriptions", () => {
  it("gives every tool at least three whole sentences", async () => {
    const descriptions = await describedTools();

    for (const [method, description] of descriptions) {
      const sentences = sentencesOf(description);
      expect(sentences.length, method).toBeGreaterThanOrEqual(MINIMUM_SENTENCES);
      expect(description.endsWith("."), method).toBe(true);
    }
  });

  it("names exactly the parameters of its own schema, in backticks, and no others", async () => {
    const descriptions = await describedTools();

    for (const [method, description] of descriptions) {
      expect(backtickedTokens(description), method).toEqual(schemaParamNames(method));
    }
  });

  it("tells a parameterless tool that it takes no parameters", async () => {
    const descriptions = await describedTools();

    for (const [method, description] of descriptions) {
      if (schemaParamNames(method).size > 0) {
        continue;
      }
      expect(description.toLowerCase(), method).toContain("takes no parameters");
    }
  });

  it("refers to a sibling tool by its advertised name, never by the dotted rpc method name", async () => {
    const descriptions = await describedTools();

    for (const [method, description] of descriptions) {
      for (const other of RPC_METHOD_NAMES) {
        expect(description, `${method} names ${other}`).not.toContain(other);
      }
    }
  });

  it("states in every spend-gated description that the call costs money, repeats, and cannot be undone", async () => {
    const descriptions = await describedTools();

    for (const method of SPEND_TOOLS) {
      const description = (descriptions.get(method) ?? "").toLowerCase();
      expect(description, method).toContain("spends provider budget");
      expect(description, method).toContain("not idempotent");
      expect(description, method).toContain("cannot be undone");
    }
  });

  it("states that the retranslate call is billed even when the result is rejected", async () => {
    const descriptions = await describedTools();

    const description = (descriptions.get("translation.retranslateEntry") ?? "").toLowerCase();
    expect(description).toContain("billed before the integrity check");
  });

  it("states that editing writes immediately and is never gated behind the spend flag", async () => {
    const descriptions = await describedTools();

    const description = (descriptions.get("translation.editEntry") ?? "").toLowerCase();
    expect(description).toContain("immediately");
    expect(description).toContain("spends no provider budget");
    expect(description).toContain("always registered");
    expect(description).toContain("never gated behind the spend flag");
  });

  it("has every read-only tool say that it calls no provider", async () => {
    const descriptions = await describedTools();

    for (const method of READ_TOOLS) {
      expect((descriptions.get(method) ?? "").toLowerCase(), method).toContain("calls no provider");
    }
  });
});

describe("registerAgentTools execute delegation", () => {
  it("delegates each execute to rpcClient.call with the tool's method and params, returning the stringified envelope", async () => {
    const { tools, calls } = await registerWith(SNAPSHOT_ON_WITH_SPEND);

    const cases = [
      { method: "key.value", params: { locale: "de", key: "greeting" } },
      {
        method: "translation.retranslateEntry",
        params: { locale: "de", key: "greeting", includeHuman: false },
      },
    ];

    for (const { method, params } of cases) {
      const output = await toolByName(tools, expectedName(method)).execute(params);
      const forMethod = calls.filter((call) => call.method === method);

      expect(forMethod).toHaveLength(1);
      expect(forMethod.at(0)?.params).toEqual(params);
      expect(output).toBe(JSON.stringify({ ok: true, result: { echoed: method } }));
    }
  });
});

describe("registerAgentTools: the editEntry tool records an agent author", () => {
  it("hides the actor parameter from the agent's input schema", async () => {
    const { tools } = await registerWith(SNAPSHOT_ON_WITH_SPEND);

    expect(toolByName(tools, expectedName("translation.editEntry")).inputSchema).toEqual(
      z.toJSONSchema(agentEditEntryParamsSchema),
    );
    expect(
      JSON.stringify(toolByName(tools, expectedName("translation.editEntry")).inputSchema),
    ).not.toContain("actor");
  });

  it("always sends actor agent, even when the agent claims to be human", async () => {
    const { tools, calls } = await registerWith(SNAPSHOT_ON_WITH_SPEND);
    const tool = toolByName(tools, expectedName("translation.editEntry"));

    await tool.execute({ locale: "de", key: "greeting", value: "Hallo" });
    await tool.execute({ locale: "de", key: "greeting", value: "Hallo", actor: "human" });

    expect(
      calls.filter((call) => call.method === "translation.editEntry").map((call) => call.params),
    ).toEqual([
      { locale: "de", key: "greeting", value: "Hallo", actor: "agent" },
      { locale: "de", key: "greeting", value: "Hallo", actor: "agent" },
    ]);
  });

  it("passes a non-object input through untouched", async () => {
    const { tools, calls } = await registerWith(SNAPSHOT_ON_WITH_SPEND);

    await toolByName(tools, expectedName("translation.editEntry")).execute(null);

    expect(calls.filter((call) => call.method === "translation.editEntry").at(0)?.params).toBe(
      null,
    );
  });
});

describe("registerAgentTools: the retranslateEntry tool never overrides a person's work", () => {
  it("hides includeHuman from the agent's input schema", async () => {
    const { tools } = await registerWith(SNAPSHOT_ON_WITH_SPEND);

    expect(
      JSON.stringify(toolByName(tools, expectedName("translation.retranslateEntry")).inputSchema),
    ).not.toContain("includeHuman");
  });

  it("always sends includeHuman false, even when the agent asks for true", async () => {
    const { tools, calls } = await registerWith(SNAPSHOT_ON_WITH_SPEND);

    await toolByName(tools, expectedName("translation.retranslateEntry")).execute({
      locale: "de",
      key: "greeting",
      includeHuman: true,
    });

    expect(
      calls.filter((call) => call.method === "translation.retranslateEntry").at(0)?.params,
    ).toEqual({ locale: "de", key: "greeting", includeHuman: false });
  });
});

describe("registerAgentTools: the locale values tool pages", () => {
  it("advertises the paging parameters without the paged switch", async () => {
    const { tools } = await registerWith(SNAPSHOT_ON_WITH_SPEND);
    const schema = toolByName(tools, expectedName("locale.values")).inputSchema;

    expect(schema).toEqual(z.toJSONSchema(agentLocaleValuesParamsSchema));
    expect(JSON.stringify(schema)).not.toContain("paged");
  });

  it("always asks for one page, with or without parameters", async () => {
    const { tools, calls } = await registerWith(SNAPSHOT_ON_WITH_SPEND);
    const tool = toolByName(tools, expectedName("locale.values"));

    await tool.execute({});
    await tool.execute({ query: "hello", limit: 5, paged: false });

    expect(
      calls.filter((call) => call.method === "locale.values").map((call) => call.params),
    ).toEqual([{ paged: true }, { query: "hello", limit: 5, paged: true }]);
  });

  it("states the default page size and the cap", async () => {
    const description = (await describedTools()).get("locale.values") ?? "";

    expect(description).toContain(`default ${LOCALE_VALUES_PAGE_LIMIT_DEFAULT}`);
    expect(description).toContain(`at most ${LOCALE_VALUES_PAGE_LIMIT_CAP}`);
  });
});
