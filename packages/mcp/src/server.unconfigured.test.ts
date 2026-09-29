import { utimes } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { type LoadedConfig, SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  type McpProjectSession,
  type McpProjectState,
  openProjectSession,
} from "./project-session.js";
import { createMcpServer } from "./server.js";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeProject,
  writeJsonFile,
} from "./test-support.js";

interface SwitchableProject {
  readonly session: McpProjectSession;
  configure(loaded: LoadedConfig): void;
  unconfigure(error: unknown): void;
}

function switchableProject(initial: McpProjectState): SwitchableProject {
  let state = initial;
  return {
    session: { current: async () => state, latest: () => state },
    configure(loaded) {
      state = { kind: "configured", loaded };
    },
    unconfigure(error) {
      state = { kind: "unconfigured", error };
    },
  };
}

const NOT_FOUND = new SdkError(
  "CONFIG_NOT_FOUND",
  "No verbatra configuration found. Create a verbatra.config.ts, a .verbatrarc.json, or a 'verbatra' property in package.json.",
);

interface Connected {
  readonly client: Client;
  readonly listChanges: () => number;
}

async function connect(project: McpProjectSession, allowSpend: boolean): Promise<Connected> {
  const dir = await makeProject({ greeting: "Hello" }, { de: {} });
  const server = createMcpServer({ project, cwd: dir, allowSpend });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  let changes = 0;
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
    changes += 1;
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, listChanges: () => changes };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const [content] = result.content as Array<{ type: string; text: string }>;
  return content?.text ?? "";
}

async function toolNames(client: Client): Promise<readonly string[]> {
  return (await client.listTools()).tools.map((tool) => tool.name);
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("createMcpServer without a usable config", () => {
  it("declares that its tool list can change", async () => {
    const { client } = await connect(
      switchableProject({ kind: "unconfigured", error: NOT_FOUND }).session,
      false,
    );

    expect(client.getServerCapabilities()?.tools?.listChanged).toBe(true);
  });

  it("lists every non-spend tool, and no spend tool even when spending is allowed", async () => {
    const project = switchableProject({ kind: "unconfigured", error: NOT_FOUND });
    const { client } = await connect(project.session, true);

    const names = await toolNames(client);

    expect(names).toContain("project.snapshot");
    expect(names).toContain("project.doctor");
    expect(names).toContain("status.check");
    expect(names).not.toContain("translation.translatePending");
    expect(names).not.toContain("translation.retranslateEntry");
  });

  it("answers project.snapshot with configured: false, the config problem, and a pointer to project.doctor", async () => {
    const project = switchableProject({ kind: "unconfigured", error: NOT_FOUND });
    const { client } = await connect(project.session, false);

    const result = await client.callTool({ name: "project.snapshot", arguments: {} });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      configured: false,
      configProblem: {
        code: "CONFIG_NOT_FOUND",
        message: `CONFIG_NOT_FOUND: ${NOT_FOUND.message}`,
      },
      nextStep: expect.stringContaining("project.doctor"),
    });
  });

  it("answers project.doctor with a failed config check that carries a fix", async () => {
    const project = switchableProject({ kind: "unconfigured", error: NOT_FOUND });
    const { client } = await connect(project.session, false);

    const result = await client.callTool({ name: "project.doctor", arguments: {} });

    const report = result.structuredContent as {
      readonly ok: boolean;
      readonly checks: readonly { readonly id: string; readonly status: string }[];
    };

    expect(result.isError).toBeUndefined();
    expect(report.ok).toBe(false);
    expect(report.checks[0]).toMatchObject({
      id: "config",
      status: "fail",
      detail: NOT_FOUND.message,
      fix: expect.stringContaining("verbatra init"),
    });
    expect(report.checks.slice(1).every((check) => check.status === "skipped")).toBe(true);
  });

  it("refuses every other tool with the config error, ending with a Next step line", async () => {
    const project = switchableProject({ kind: "unconfigured", error: NOT_FOUND });
    const { client } = await connect(project.session, false);

    const result = await client.callTool({ name: "status.check", arguments: {} });
    const text = textOf(result);

    expect(result.isError).toBe(true);
    expect(text.startsWith("CONFIG_NOT_FOUND: ")).toBe(true);
    expect(text).toContain("status.check needs a usable project config");
    expect(text.split("\n").at(-1)).toMatch(/^Next step: Run `verbatra init`.*project\.doctor/);
  });

  it("still validates input before refusing", async () => {
    const project = switchableProject({ kind: "unconfigured", error: NOT_FOUND });
    const { client } = await connect(project.session, false);

    const result = await client.callTool({ name: "project.doctor", arguments: { bogus: true } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^Invalid input/);
  });
});

describe("createMcpServer: config changes after startup", () => {
  it("serves the loaded config once it appears, and announces the spend tools it now lists", async () => {
    const project = switchableProject({ kind: "unconfigured", error: NOT_FOUND });
    const { client, listChanges } = await connect(project.session, true);
    await client.listTools();

    project.configure(baseLoadedConfig());
    const snapshot = await client.callTool({ name: "project.snapshot", arguments: {} });
    await settle();

    expect(snapshot.structuredContent).toMatchObject({ configured: true, sourceLocale: "en" });
    expect(listChanges()).toBe(1);
    expect(await toolNames(client)).toContain("translation.translatePending");
  });

  it("never adds a spend tool when spending was not allowed at startup", async () => {
    const project = switchableProject({ kind: "unconfigured", error: NOT_FOUND });
    const { client, listChanges } = await connect(project.session, false);
    await client.listTools();

    project.configure(baseLoadedConfig());
    await client.callTool({ name: "project.snapshot", arguments: {} });
    await settle();

    expect(listChanges()).toBe(0);
    expect(await toolNames(client)).not.toContain("translation.translatePending");
  });

  it("withdraws the spend tools when an edit switches the provider to none", async () => {
    const project = switchableProject({ kind: "configured", loaded: baseLoadedConfig() });
    const { client, listChanges } = await connect(project.session, true);
    expect(await toolNames(client)).toContain("translation.translatePending");

    project.configure(
      baseLoadedConfig({ config: baseVerbatraConfig({ provider: { id: "none", options: {} } }) }),
    );
    const refused = await client.callTool({ name: "project.snapshot", arguments: {} });
    await settle();

    expect(refused.isError).toBeUndefined();
    expect(listChanges()).toBe(1);
    expect(await toolNames(client)).not.toContain("translation.translatePending");
    await expect(
      client.callTool({ name: "translation.translatePending", arguments: {} }),
    ).rejects.toMatchObject({ code: -32601 });
  });

  it("refuses tools again when the config becomes invalid", async () => {
    const project = switchableProject({ kind: "configured", loaded: baseLoadedConfig() });
    const { client } = await connect(project.session, false);

    project.unconfigure(
      new SdkError("CONFIG_INVALID", "The verbatra configuration is invalid: format: bad"),
    );
    const result = await client.callTool({ name: "status.check", arguments: {} });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^CONFIG_INVALID: /);
  });

  it("does not announce a change when the tool list stayed the same", async () => {
    const project = switchableProject({ kind: "configured", loaded: baseLoadedConfig() });
    const { client, listChanges } = await connect(project.session, true);
    await client.listTools();

    project.configure(baseLoadedConfig({ config: baseVerbatraConfig({ targetLocales: ["fr"] }) }));
    await client.callTool({ name: "project.snapshot", arguments: {} });
    await settle();

    expect(listChanges()).toBe(0);
  });
});

describe("createMcpServer over a real project session", () => {
  it("picks up a config created and then edited on disk without a restart", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const project = await openProjectSession({ cwd: dir });
    const { client } = await connect(project, false);

    const before = await client.callTool({ name: "project.snapshot", arguments: {} });
    const configPath = join(dir, ".verbatrarc.json");
    await writeJsonFile(configPath, {
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "none" },
    });
    const created = await client.callTool({ name: "status.check", arguments: {} });
    await writeJsonFile(configPath, {
      sourceLocale: "en",
      targetLocales: ["de", "fr"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "none" },
    });
    const later = new Date(Date.now() + 5000);
    await utimes(configPath, later, later);
    const edited = await client.callTool({ name: "project.snapshot", arguments: {} });

    expect(before.structuredContent).toMatchObject({ configured: false });
    expect(created.isError).toBeUndefined();
    expect(created.structuredContent).toMatchObject({ locales: [{ locale: "de" }] });
    expect(edited.structuredContent).toMatchObject({
      configured: true,
      targetLocales: ["de", "fr"],
    });
  });
});
