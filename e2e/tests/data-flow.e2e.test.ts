import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";
import { NETWORK_ATTEMPT_MESSAGE, noNetworkNodeOptions } from "../src/no-network.js";

interface DoctorJson {
  ok: boolean;
  checks: { id: string; status: string }[];
  dataFlow?: unknown;
}

const NO_KEYS: Record<string, string> = {
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  DEEPL_API_KEY: "",
  GOOGLE_TRANSLATE_API_KEY: "",
  OPENAI_COMPATIBLE_API_KEY: "",
  VERBATRA_NETWORK_POLICY: "",
  VERBATRA_NETWORK_ALLOWED_HOSTS: "",
  NODE_USE_ENV_PROXY: "",
};

const VALIDATE_SCRIPT = [
  'import { readFileSync } from "node:fs";',
  'import { dataFlowManifestSchema } from "@verbatra/sdk";',
  'const envelope = JSON.parse(readFileSync(0, "utf8"));',
  "const parsed = dataFlowManifestSchema.safeParse(envelope.result.dataFlow);",
  "if (!parsed.success) {",
  "  console.error(JSON.stringify(parsed.error.issues));",
  "  process.exit(1);",
  "}",
  "console.log(JSON.stringify(parsed.data.destinations.map((d) => d.host)));",
  "",
].join("\n");

let consumer: Consumer;
let offlineEnv: Record<string, string>;

beforeAll(async () => {
  consumer = await readSharedConsumer();
  offlineEnv = { ...NO_KEYS, NODE_OPTIONS: await noNetworkNodeOptions(consumer.dir, "data-flow") };
  await writeFileIn(consumer.dir, "validate-data-flow.mjs", VALIDATE_SCRIPT);
}, 180_000);

async function scaffold(name: string, provider: Record<string, unknown>): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales: ["de", "fr"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider,
  });
  await writeJsonIn(dir, "locales/en.json", { greeting: "Hello", welcome: "Hi {{name}}" });
  return dir;
}

describe("doctor --data-flow (keyless, no network)", () => {
  it("prints a manifest the published schema accepts, with a hosted provider and no key", async () => {
    const dir = await scaffold("data-flow-hosted", {
      id: "anthropic",
      options: { model: "claude-sonnet-4-5", maxTokens: 1024 },
    });

    const result = await runVerbatra(consumer, ["doctor", "--data-flow", "--json", "--cwd", dir], {
      env: offlineEnv,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain(NETWORK_ATTEMPT_MESSAGE);
    const envelope = parseEnvelope<DoctorJson>(result.stdout);
    expect(envelope.ok && envelope.command).toBe("doctor");
    expect(envelope.ok && envelope.result.checks.map((check) => check.id)).toEqual([
      "config",
      "data-flow",
    ]);

    const validation = await execa(process.execPath, ["validate-data-flow.mjs"], {
      cwd: consumer.dir,
      input: result.stdout,
      reject: false,
    });
    expect(validation.stderr).toBe("");
    expect(validation.exitCode).toBe(0);
    expect(JSON.parse(validation.stdout)).toEqual(["api.anthropic.com"]);
  });

  it("lists both DeepL hosts without a key and states provider none sends nothing", async () => {
    const deepl = await scaffold("data-flow-deepl", { id: "deepl", options: {} });
    const none = await scaffold("data-flow-none", { id: "none" });

    const deeplRun = await runVerbatra(consumer, ["doctor", "--data-flow", "--cwd", deepl], {
      env: offlineEnv,
    });
    const noneRun = await runVerbatra(
      consumer,
      ["doctor", "--data-flow", "--json", "--cwd", none],
      {
        env: offlineEnv,
      },
    );

    expect(deeplRun.exitCode).toBe(0);
    expect(deeplRun.stdout).toContain("api.deepl.com");
    expect(deeplRun.stdout).toContain("api-free.deepl.com");
    expect(deeplRun.stderr).toContain("describing the data flow");
    expect(noneRun.exitCode).toBe(0);
    const envelope = parseEnvelope<DoctorJson>(noneRun.stdout);
    expect(envelope.ok && envelope.result.dataFlow).toMatchObject({
      sent: { nothing: true },
      destinations: [],
    });
  });

  it("refuses --data-flow with --live as a usage error", async () => {
    const dir = await scaffold("data-flow-conflict", { id: "deepl", options: {} });

    const result = await runVerbatra(consumer, ["doctor", "--data-flow", "--live", "--cwd", dir], {
      env: offlineEnv,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("INVALID_OPTION");
  });
});
