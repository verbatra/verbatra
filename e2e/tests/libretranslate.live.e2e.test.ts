import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";
import { classifyLiveRun, type RunTarget } from "../src/run-outcome.js";

const baseUrl = process.env.LIBRETRANSLATE_URL ?? "";
const targetLocale = process.env.LIBRETRANSLATE_TARGET ?? "de";

const SOURCE = {
  greeting: "Hello {{name}}, welcome back!",
  inbox: "You have {{count}} new messages.",
  save: "Save changes",
  link: "Open <b>settings</b> now",
};

const TARGET: RunTarget = { locale: targetLocale, key: "greeting" };

interface DoctorEnvelopeResult {
  readonly checks: ReadonlyArray<{ readonly id: string; readonly status: string }>;
  readonly locales?: {
    readonly tableOrigin: string;
    readonly live?: { readonly status: string };
    readonly locales: ReadonlyArray<{ readonly locale: string; readonly support: string }>;
  };
}

async function writeProject(consumer: Consumer, name: string): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeFileIn(
    dir,
    "verbatra.config.ts",
    `import { defineConfig } from "@verbatra/cli";\n\nexport default defineConfig({\n  sourceLocale: "en",\n  targetLocales: [${JSON.stringify(targetLocale)}],\n  format: "i18next-json",\n  files: { pattern: "locales/{locale}.json" },\n  provider: { id: "libretranslate", options: { baseUrl: ${JSON.stringify(baseUrl)} } },\n  network: { policy: "local-only" },\n});\n`,
  );
  await writeJsonIn(dir, "locales/en.json", SOURCE);
  return dir;
}

describe.skipIf(baseUrl === "")(`libretranslate (live: ${baseUrl || "skipped"})`, () => {
  let consumer: Consumer;

  beforeAll(async () => {
    consumer = await readSharedConsumer();
  }, 180_000);

  it("checks the configured locales against the server's own language list", async () => {
    const dir = await writeProject(consumer, "libretranslate-doctor");

    const result = await runVerbatra(consumer, ["doctor", "--live", "--json", "--cwd", dir]);

    const envelope = parseEnvelope<DoctorEnvelopeResult>(result.stdout.trim());
    expect(envelope.ok, result.stderr).toBe(true);
    if (!envelope.ok) {
      return;
    }
    expect(envelope.result.checks.find((check) => check.id === "api-key")?.status).toBe("pass");
    expect(envelope.result.checks.find((check) => check.id === "network-policy")?.status).toBe(
      "pass",
    );
    expect(envelope.result.locales?.live?.status).toBe("refreshed");
    expect(envelope.result.locales?.tableOrigin).toBe("live");
    expect(envelope.result.locales?.locales).toEqual([
      expect.objectContaining({ locale: targetLocale, support: "supported" }),
    ]);
  });

  it("translates the missing keys, keeps every placeholder, and leaves the project in sync", async () => {
    const dir = await writeProject(consumer, "libretranslate-translate");

    const translated = await runVerbatra(consumer, ["translate", "--json", "--cwd", dir]);

    const verdict = classifyLiveRun(translated, TARGET);
    expect(verdict, translated.stderr).toEqual({ kind: "clean" });
    const written = await readJsonIn<Record<string, string>>(dir, `locales/${targetLocale}.json`);
    expect(Object.keys(written).sort()).toEqual(Object.keys(SOURCE).sort());
    expect(written.greeting).toContain("{{name}}");
    expect(written.inbox).toContain("{{count}}");
    expect(written.save).not.toBe(SOURCE.save);
    expect(written.link).toMatch(/<b>[^<]+<\/b>/);
    expect(written.link).not.toContain("<b>settings</b>");

    const check = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);
    expect(check.exitCode, check.stderr).toBe(0);
  });
});
