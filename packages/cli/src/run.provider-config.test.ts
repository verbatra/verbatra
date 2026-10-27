import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import { captureStreams, parseEnvelope, recordingDeps } from "./test-support.js";

async function projectWithStrayProviderKey(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-cli-provider-key-"));
  const config = {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "deepl", options: {}, localeMap: { de: "de-DE" } },
  };
  await writeFile(join(dir, ".verbatrarc.json"), JSON.stringify(config), "utf8");
  return dir;
}

describe("run: a stray key in the provider block", () => {
  it("names the key and its path in the human-readable error", async () => {
    const dir = await projectWithStrayProviderKey();
    const { deps } = recordingDeps({ loadConfig });
    const cap = captureStreams();

    expect(await run(["check", "--cwd", dir], deps, cap.streams)).toBe(2);

    expect(cap.err()).toContain("[CONFIG_INVALID]");
    expect(cap.err()).toContain('provider: Unrecognized key: "localeMap"');
  });

  it("names the key and its path in the --json failure envelope", async () => {
    const dir = await projectWithStrayProviderKey();
    const { deps } = recordingDeps({ loadConfig });
    const cap = captureStreams();

    expect(await run(["check", "--cwd", dir, "--json"], deps, cap.streams)).toBe(2);

    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: false,
      code: "CONFIG_INVALID",
      message: expect.stringContaining('provider: Unrecognized key: "localeMap"'),
    });
  });
});
