import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { type Consumer, readSharedConsumer, runVerbatra, writeFileIn } from "../src/harness.js";
import { noNetworkNodeOptions } from "../src/no-network.js";

const NO_KEYS: Record<string, string> = {
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  DEEPL_API_KEY: "",
  GOOGLE_TRANSLATE_API_KEY: "",
  OPENAI_COMPATIBLE_API_KEY: "",
  OPENCODE_API_KEY: "",
  LIBRETRANSLATE_API_KEY: "",
};

let consumer: Consumer;
let offlineEnv: Record<string, string>;

beforeAll(async () => {
  consumer = await readSharedConsumer();
  offlineEnv = {
    ...NO_KEYS,
    NODE_OPTIONS: await noNetworkNodeOptions(consumer.dir, "first-run"),
  };
}, 180_000);

describe("first run on a project that already has locale files (no key, no network)", () => {
  it("init then translate --dry-run exits 0 without an API key or any network call", async () => {
    const dir = join(consumer.dir, "first-run-init-dry-run");
    await mkdir(dir, { recursive: true });
    await writeFileIn(dir, "locales/en.json", '{"greeting":"Hello {{name}}","farewell":"Goodbye"}');
    const run = (args: string[]) =>
      runVerbatra(consumer, [...args, "--cwd", dir], { env: offlineEnv });

    const init = await run(["init", "--format", "i18next-json", "--provider", "gemini", "--yes"]);
    expect(init.exitCode, init.stderr).toBe(0);

    const dryRun = await run(["translate", "--dry-run"]);
    expect(dryRun.exitCode, dryRun.stderr).toBe(0);
    expect(`${dryRun.stdout}${dryRun.stderr}`).not.toContain("a network call was attempted");
  });
});
