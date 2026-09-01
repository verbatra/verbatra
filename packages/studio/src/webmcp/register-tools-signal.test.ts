import { describe, expect, it } from "vitest";
import type { RpcCallResult, RpcClient } from "../client/rpc-client.js";
import { rpcParamsSchemas } from "../shared/rpc/contract.js";
import type { ProjectSnapshotResult } from "../shared/rpc/snapshot.js";
import {
  type ModelContext,
  type RegisterToolOptions,
  registerAgentTools,
  type WebMcpTool,
} from "./register-tools.js";
import type { AgentToolsRegistration } from "./registration-report.js";

const SNAPSHOT_RESULT: ProjectSnapshotResult = {
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "anthropic" },
  configSource: "override",
  glossary: { source: "none" },
  capabilities: { spend: false, writeToDisk: true },
  exposeAgentTools: true,
};

const SNAPSHOT_ON: RpcCallResult<"project.snapshot"> = { ok: true, result: SNAPSHOT_RESULT };

const TOOLS_WITHOUT_SPEND = 13;

interface FakeHost {
  readonly context: ModelContext;
  readonly tools: WebMcpTool[];
  readonly optionsPerCall: (RegisterToolOptions | undefined)[];
}

function makeFakeHost(): FakeHost {
  const tools: WebMcpTool[] = [];
  const optionsPerCall: (RegisterToolOptions | undefined)[] = [];
  return {
    context: {
      registerTool: (tool, options): void => {
        optionsPerCall.push(options);
        tools.push(tool);
        options?.signal?.addEventListener("abort", () => {
          const index = tools.indexOf(tool);
          if (index >= 0) {
            tools.splice(index, 1);
          }
        });
      },
    },
    tools,
    optionsPerCall,
  };
}

function makeRejectingHost(refused: string): FakeHost {
  const host = makeFakeHost();
  const accept = host.context.registerTool.bind(host.context);
  return {
    ...host,
    context: {
      registerTool: (tool, options): PromiseLike<void> | void => {
        if (tool.name === refused) {
          const error = new Error("registration refused");
          error.name = "SecurityError";
          return Promise.reject(error);
        }
        return accept(tool, options);
      },
    },
  };
}

function makeRpcClient(methods: string[], onSnapshot?: () => void): RpcClient {
  const call = async (method: string): Promise<unknown> => {
    methods.push(method);
    if (method === "project.snapshot") {
      onSnapshot?.();
      return SNAPSHOT_ON;
    }
    return { ok: true, result: {} };
  };
  return { call } as RpcClient;
}

function register(
  host: FakeHost,
  methods: string[],
  signal: AbortSignal | undefined,
  onSnapshot?: () => void,
): Promise<AgentToolsRegistration> {
  return registerAgentTools({
    modelContext: host.context,
    rpcClient: makeRpcClient(methods, onSnapshot),
    schemas: rpcParamsSchemas,
    ...(signal === undefined ? {} : { signal }),
  });
}

describe("registerAgentTools teardown signal", () => {
  it("passes one and the same signal to every registration, and each reports aborted after abort", async () => {
    const controller = new AbortController();
    const host = makeFakeHost();

    await register(host, [], controller.signal);
    const signals = host.optionsPerCall.map((options) => options?.signal);

    expect(signals).toHaveLength(TOOLS_WITHOUT_SPEND);
    for (const signal of signals) {
      expect(signal).toBe(controller.signal);
      expect(signal?.aborted).toBe(false);
    }

    controller.abort();

    for (const signal of signals) {
      expect(signal?.aborted).toBe(true);
    }
  });

  it("leaves the host surface empty once the signal aborts", async () => {
    const controller = new AbortController();
    const host = makeFakeHost();

    const registration = await register(host, [], controller.signal);

    expect(host.tools).toHaveLength(TOOLS_WITHOUT_SPEND);
    expect(registration.registered).toHaveLength(TOOLS_WITHOUT_SPEND);

    controller.abort();

    expect(host.tools).toEqual([]);
  });

  it("survives an abort called twice and an abort with no registration behind it", async () => {
    const controller = new AbortController();
    const host = makeFakeHost();

    await register(host, [], controller.signal);
    controller.abort();
    controller.abort();
    new AbortController().abort();

    expect(host.tools).toEqual([]);
    expect(controller.signal.aborted).toBe(true);
  });

  it("registers nothing and calls no rpc when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const host = makeFakeHost();
    const methods: string[] = [];

    const registration = await register(host, methods, controller.signal);

    expect(registration).toEqual({ attempted: 0, registered: [], failures: [] });
    expect(host.tools).toEqual([]);
    expect(methods).toEqual([]);
  });

  it("registers nothing when the signal aborts while the snapshot call is in flight", async () => {
    const controller = new AbortController();
    const host = makeFakeHost();
    const methods: string[] = [];

    const registration = await register(host, methods, controller.signal, () => controller.abort());

    expect(registration).toEqual({ attempted: 0, registered: [], failures: [] });
    expect(host.tools).toEqual([]);
    expect(methods).toEqual(["project.snapshot"]);
  });

  it("stops the pass where it stands when the signal aborts part way through", async () => {
    const controller = new AbortController();
    const host = makeFakeHost();
    const stopAfter = 4;
    const context: ModelContext = {
      registerTool: (tool, options): void => {
        host.context.registerTool(tool, options);
        if (host.optionsPerCall.length === stopAfter) {
          controller.abort();
        }
      },
    };

    const registration = await registerAgentTools({
      modelContext: context,
      rpcClient: makeRpcClient([]),
      schemas: rpcParamsSchemas,
      signal: controller.signal,
    });

    expect(host.optionsPerCall).toHaveLength(stopAfter);
    expect(registration.attempted).toBe(stopAfter);
    expect(host.tools).toEqual([]);
  });

  it("passes no options at all when the caller supplies no signal", async () => {
    const host = makeFakeHost();

    const registration = await register(host, [], undefined);

    expect(host.tools).toHaveLength(TOOLS_WITHOUT_SPEND);
    expect(registration.failures).toEqual([]);
    for (const options of host.optionsPerCall) {
      expect(options).toBeUndefined();
    }
  });

  it("still reports a refused registration while a signal is in play", async () => {
    const controller = new AbortController();
    const refused = "verbatra_status_diff";
    const host = makeRejectingHost(refused);

    const registration = await register(host, [], controller.signal);

    expect(registration.failures).toEqual([
      { tool: refused, errorName: "SecurityError", message: "registration refused" },
    ]);
    expect(registration.registered).toHaveLength(TOOLS_WITHOUT_SPEND - 1);
    expect(host.tools.map((tool) => tool.name)).not.toContain(refused);
  });
});
