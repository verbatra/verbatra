import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";

interface LocaleCapabilityJson {
  locale: string;
  providerCode: string;
  support: string;
  glossary: boolean;
  formality: boolean;
  warnings: { code: string }[];
}

interface DoctorJson {
  ok: boolean;
  checks: { id: string; status: string; detail: string }[];
  locales?: {
    provider: string;
    tableOrigin: string;
    locales: LocaleCapabilityJson[];
  };
}

const NO_NETWORK_PRELOAD = [
  'import dns from "node:dns";',
  'import { syncBuiltinESMExports } from "node:module";',
  'import net from "node:net";',
  "const refuse = () => {",
  '  throw new Error("locale-support e2e: a network call was attempted");',
  "};",
  "globalThis.fetch = refuse;",
  "net.Socket.prototype.connect = refuse;",
  "dns.lookup = refuse;",
  "dns.promises.lookup = refuse;",
  "syncBuiltinESMExports();",
  "",
].join("\n");

const NO_KEYS: Record<string, string> = {
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  DEEPL_API_KEY: "",
  GOOGLE_TRANSLATE_API_KEY: "",
  OPENAI_COMPATIBLE_API_KEY: "",
  VERBATRA_NETWORK_POLICY: "",
  VERBATRA_NETWORK_ALLOWED_HOSTS: "",
};

let consumer: Consumer;
let offlineEnv: Record<string, string>;

beforeAll(async () => {
  consumer = await readSharedConsumer();
  const preloadDir = join(consumer.dir, "locale-support-preload");
  await writeFileIn(preloadDir, "no-network.mjs", NO_NETWORK_PRELOAD);
  const preloadUrl = pathToFileURL(join(preloadDir, "no-network.mjs")).href;
  offlineEnv = { ...NO_KEYS, NODE_OPTIONS: `--import ${preloadUrl}` };
}, 180_000);

async function scaffold(name: string, targetLocales: readonly string[]): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales,
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "deepl", options: {} },
    tone: "formal",
  });
  await writeJsonIn(dir, "locales/en.json", { greeting: "Hello" });
  return dir;
}

async function missing(path: string): Promise<boolean> {
  return access(path).then(
    () => false,
    () => true,
  );
}

describe("locale support pre-flight (keyless, no network)", () => {
  it("refuses a translate dry run with an unsupported locale before any locale starts", async () => {
    const dir = await scaffold("locale-support-dry-run", ["de", "chr"]);

    const result = await runVerbatra(consumer, ["translate", "--dry-run", "--json", "--cwd", dir], {
      env: offlineEnv,
    });

    expect(result.exitCode).toBe(2);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.ok).toBe(false);
    if (!envelope.ok) {
      expect(envelope.command).toBe("translate");
      expect(envelope.code).toBe("LOCALE_UNSUPPORTED_BY_PROVIDER");
      expect(envelope.message).toContain('the target locale "chr" (sent as "CHR")');
    }
    expect(result.stderr).toContain("[LOCALE_UNSUPPORTED_BY_PROVIDER]");
    expect(result.stderr).not.toContain("network call was attempted");
    expect(await missing(join(dir, "locales", "de.json"))).toBe(true);
    expect(await missing(join(dir, "verbatra.lock.json"))).toBe(true);
  });

  it("refuses a live translate run the same way, before the provider or its key is touched", async () => {
    const dir = await scaffold("locale-support-live", ["de", "chr"]);

    const result = await runVerbatra(consumer, ["translate", "--cwd", dir], { env: offlineEnv });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("verbatra: error [LOCALE_UNSUPPORTED_BY_PROVIDER]");
    expect(result.stderr).not.toContain("DEEPL_API_KEY");
    expect(await missing(join(dir, "locales", "de.json"))).toBe(true);
  });

  it("plans the supported locales once the unsupported one is left out, with the tone warning", async () => {
    const dir = await scaffold("locale-support-subset", ["de", "sv", "chr"]);

    const result = await runVerbatra(
      consumer,
      ["translate", "--dry-run", "--json", "--locales", "de,sv", "--cwd", dir],
      { env: offlineEnv },
    );

    expect(result.exitCode).toBe(0);
    const envelope = parseEnvelope<{ locales: { locale: string; notices: { code: string }[] }[] }>(
      result.stdout,
    );
    if (!envelope.ok) {
      throw new Error("expected a success envelope");
    }
    const notices = envelope.result.locales.map((entry) => [
      entry.locale,
      entry.notices.map((notice) => notice.code),
    ]);
    expect(notices).toEqual([
      ["de", []],
      ["sv", ["FORMALITY_UNSUPPORTED_BY_PROVIDER"]],
    ]);
  });

  it("reports every locale's support from doctor --json without a key or a request", async () => {
    const dir = await scaffold("locale-support-doctor", ["de", "sv", "chr"]);

    const result = await runVerbatra(consumer, ["doctor", "--json", "--cwd", dir], {
      env: offlineEnv,
    });

    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope<DoctorJson>(result.stdout);
    if (!envelope.ok) {
      throw new Error("expected a success envelope");
    }
    const check = envelope.result.checks.find((entry) => entry.id === "locales");
    expect(check?.status).toBe("fail");
    expect(check?.detail).toContain('unsupported: "chr"');
    expect(envelope.result.locales?.tableOrigin).toBe("static");
    expect(
      envelope.result.locales?.locales.map((entry) => [
        entry.locale,
        entry.providerCode,
        entry.support,
      ]),
    ).toEqual([
      ["de", "DE", "supported"],
      ["sv", "SV", "supported"],
      ["chr", "CHR", "unsupported"],
    ]);
    expect(result.stderr).not.toContain("network call was attempted");
  });

  it("prints the per-locale table under doctor --locales, and --live without a key sends nothing", async () => {
    const dir = await scaffold("locale-support-doctor-live", ["de"]);

    const result = await runVerbatra(consumer, ["doctor", "--live", "--cwd", dir], {
      env: offlineEnv,
    });

    expect(result.stdout).toContain("locale support (deepl, language table of");
    expect(result.stdout).toContain("de  sent as DE  supported  glossary: yes  formality: yes");
    expect(result.stdout).toContain("live language list skipped: DEEPL_API_KEY is not set");
    expect(result.stderr).not.toContain("network call was attempted");
  });
});
