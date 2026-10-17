import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openProjectSession } from "./project-session.js";
import { createMcpServer } from "./server.js";
import { resolveServerCwd } from "./server-cwd.js";
import { baseVerbatraConfig, makeProject, writeJsonFile } from "./test-support.js";

const CODEX_PROJECT_CONFIG = [
  "[mcp_servers.verbatra]",
  'command = "npx"',
  'args = ["-y", "@verbatra/mcp"]',
  "startup_timeout_sec = 60",
  "",
].join("\n");

afterEach(() => {
  vi.restoreAllMocks();
});

async function startedLikeCodexIn(subdirectory: readonly string[]) {
  const root = await makeProject(
    { greeting: "Hello", farewell: "Bye" },
    { de: { greeting: "Hallo" } },
  );
  await mkdir(join(root, ".git"), { recursive: true });
  await mkdir(join(root, ".codex"), { recursive: true });
  await writeFile(join(root, ".codex", "config.toml"), CODEX_PROJECT_CONFIG);
  await writeJsonFile(
    join(root, ".verbatrarc.json"),
    baseVerbatraConfig({ provider: { id: "none", options: {} } }),
  );
  const sessionDir = join(root, ...subdirectory);
  await mkdir(join(sessionDir, "locales"), { recursive: true });
  await writeJsonFile(join(sessionDir, "locales", "en.json"), { decoy: "Decoy" });
  vi.spyOn(process, "cwd").mockReturnValue(sessionDir);
  const cwd = resolveServerCwd(undefined, {});
  const project = await openProjectSession({ cwd });
  const server = createMcpServer({ project, cwd, allowSpend: false });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "codex-like-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, cwd, sessionDir };
}

describe("the server init --agent wires for Codex, started in a subdirectory", () => {
  it("starts from the session directory, with no --cwd and no CLAUDE_PROJECT_DIR", async () => {
    const { cwd, sessionDir } = await startedLikeCodexIn(["packages", "app"]);

    expect(cwd).toBe(sessionDir);
  });

  it("finds the project's config and reads the locale files next to it", async () => {
    const { client } = await startedLikeCodexIn(["packages", "app"]);

    const snapshot = await client.callTool({ name: "project.snapshot", arguments: {} });
    const status = await client.callTool({ name: "status.check", arguments: {} });

    expect(snapshot.structuredContent).toMatchObject({
      configured: true,
      configSource: ".verbatrarc.json",
    });
    expect(status.structuredContent).toMatchObject({
      locales: [{ locale: "de", missing: 1, upToDate: 1 }],
    });
  });
});
