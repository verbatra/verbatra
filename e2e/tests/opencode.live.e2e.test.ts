import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  liveRunRequired,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";
import { classifyLiveRun, type RunTarget } from "../src/run-outcome.js";

const hasKey = (process.env.OPENCODE_API_KEY ?? "") !== "";
const skipLive = !hasKey && !liveRunRequired();
const model = process.env.OPENCODE_MODEL ?? "glm-5.3";

const SOURCE = {
  greeting: "Hello {{name}}, welcome back!",
  inbox: "You have {{count}} new messages.",
  save: "Save changes",
};

const TARGET: RunTarget = { locale: "de", key: "greeting" };

async function writeProject(consumer: Consumer, name: string): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeFileIn(
    dir,
    "verbatra.config.ts",
    `import { defineConfig } from "@verbatra/cli";\n\nexport default defineConfig({\n  sourceLocale: "en",\n  targetLocales: ["de"],\n  format: "i18next-json",\n  files: { pattern: "locales/{locale}.json" },\n  provider: { id: "opencode", options: { model: ${JSON.stringify(model)}, maxOutputTokens: 4096 } },\n});\n`,
  );
  await writeJsonIn(dir, "locales/en.json", SOURCE);
  return dir;
}

describe.skipIf(skipLive)(`opencode (live: ${hasKey ? model : "skipped"})`, () => {
  let consumer: Consumer;

  beforeAll(async () => {
    if (!hasKey) {
      throw new Error(
        "E2E_REQUIRE_LIVE is set, but OPENCODE_API_KEY is empty, so the live tier cannot run.",
      );
    }
    consumer = await readSharedConsumer();
  }, 180_000);

  it("translates the missing keys, keeps every placeholder, and leaves the project in sync", async () => {
    const dir = await writeProject(consumer, "opencode-translate");

    const translated = await runVerbatra(consumer, ["translate", "--json", "--cwd", dir]);

    const verdict = classifyLiveRun(translated, TARGET);
    expect(verdict, translated.stderr).toEqual({ kind: "clean" });
    const written = await readJsonIn<Record<string, string>>(dir, "locales/de.json");
    expect(Object.keys(written).sort()).toEqual(Object.keys(SOURCE).sort());
    expect(written.greeting).toContain("{{name}}");
    expect(written.inbox).toContain("{{count}}");

    const check = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);
    expect(check.exitCode, check.stderr).toBe(0);
  });
});
