import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "./server.js";
import {
  baseLoadedConfig,
  makeTempDir,
  nodeFs,
  staticProject,
  writeJsonFile,
} from "./test-support.js";

const OLD_BODY = "A1b2C3d4".repeat(6);
const NEW_BODY = "Z9y8X7w6".repeat(6);
const LIVE_KEY = `proj-key-${"R".repeat(20)}`;

function git(dir: string, ...args: string[]): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Ada",
      "-c",
      "user.email=ada@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd: dir, stdio: "ignore" },
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  git(dir, "init", "--quiet", "-b", "main");
  await writeJsonFile(join(dir, "locales", "en.json"), { a: "Source", b: "S" });
  await writeJsonFile(join(dir, "locales", "de.json"), {
    a: `Schluessel sk-proj-${OLD_BODY} Ende`,
    b: "env plain",
  });
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "-m", "one");
  await writeJsonFile(join(dir, "locales", "de.json"), {
    a: `Schluessel sk-proj-${NEW_BODY} Ende`,
    b: `env ${LIVE_KEY}`,
  });
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "-m", "two");
  return dir;
}

async function connect(dir: string): Promise<Client> {
  const server = createMcpServer({
    project: staticProject(baseLoadedConfig()),
    cwd: dir,
    allowSpend: false,
    fs: nodeFs,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("history.keyRevisions over the protocol", () => {
  it("never returns a key, even when its diff would split it at a hyphen", async () => {
    vi.stubEnv("OPENAI_API_KEY", LIVE_KEY);
    const client = await connect(await project());

    for (const key of ["a", "b"]) {
      const result = await client.callTool({
        name: "history.keyRevisions",
        arguments: { locale: "de", key },
      });
      const text = JSON.stringify(result);

      expect(text).not.toContain(NEW_BODY);
      expect(text).not.toContain("R".repeat(20));
      expect(text).toContain("[REDACTED]");
    }
  });
});
