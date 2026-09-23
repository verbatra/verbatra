import { access } from "node:fs/promises";
import { join } from "node:path";
import type { SdkFs } from "@verbatra/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startMcpServer } from "./start-server.js";
import { makeContext, makeProject, nodeFs, writeJsonFile } from "./test-support.js";
import { glossaryGetTool } from "./tools/glossary.js";
import type { McpToolContext } from "./types.js";

const connected = vi.hoisted(() => ({ contexts: [] as McpToolContext[] }));

vi.mock("./server.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./server.js")>();
  return {
    ...original,
    connectMcpServer: (context: McpToolContext, ...rest: unknown[]) => {
      connected.contexts.push(context);
      return (original.connectMcpServer as (...args: unknown[]) => unknown)(context, ...rest);
    },
  };
});

interface InMemoryGlossaryFs {
  readonly fs: SdkFs;
  readonly servedPaths: string[];
}

function inMemoryGlossaryFs(path: string, content: string): InMemoryGlossaryFs {
  const servedPaths: string[] = [];
  const fs: SdkFs = {
    ...nodeFs,
    async readFileBounded(requested, maxBytes) {
      if (requested === path) {
        servedPaths.push(requested);
        return { kind: "ok", content };
      }
      return nodeFs.readFileBounded(requested, maxBytes);
    },
  };
  return { fs, servedPaths };
}

async function existsOnDisk(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("startMcpServer: injected fs", () => {
  afterEach(() => {
    connected.contexts.length = 0;
  });

  it("loads a file-backed glossary through the injected fs, never from disk", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const configPath = join(dir, "verbatra.config.json");
    const glossaryPath = join(dir, "glossary.json");
    await writeJsonFile(configPath, {
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "anthropic", options: { model: "test-model", maxTokens: 256 } },
      glossary: "./glossary.json",
    });
    const memory = inMemoryGlossaryFs(
      glossaryPath,
      JSON.stringify({ API: "API", Dashboard: "Armaturenbrett" }),
    );

    const handle = await startMcpServer({ cwd: dir, configPath, fs: memory.fs });
    await handle.close();

    expect(await existsOnDisk(glossaryPath)).toBe(false);
    expect(connected.contexts).toHaveLength(1);
    const [context] = connected.contexts;
    expect(context?.config.config.glossary).toEqual({ API: "API", Dashboard: "Armaturenbrett" });
    expect(context?.fs).toBe(memory.fs);

    const outcome = await glossaryGetTool.execute({}, makeContext(context));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        indicator: { source: "file" },
        entries: { API: "API", Dashboard: "Armaturenbrett" },
      },
    });
    expect(memory.servedPaths).toEqual([glossaryPath, glossaryPath]);
  });
});
