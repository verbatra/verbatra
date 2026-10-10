import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";
import { noNetworkNodeOptions } from "../src/no-network.js";

interface DoctorJson {
  ok: boolean;
  checks: { id: string; status: string; detail: string }[];
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

const HOSTED = { id: "anthropic", options: { model: "claude-sonnet-4-5", maxTokens: 1024 } };

let consumer: Consumer;
let offlineEnv: Record<string, string>;

beforeAll(async () => {
  consumer = await readSharedConsumer();
  offlineEnv = {
    ...NO_KEYS,
    NODE_OPTIONS: await noNetworkNodeOptions(consumer.dir, "network-policy"),
  };
}, 180_000);

async function scaffold(name: string, network?: Record<string, unknown>): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: HOSTED,
    ...(network === undefined ? {} : { network }),
  });
  await writeJsonIn(dir, "locales/en.json", { greeting: "Hello" });
  return dir;
}

function refusalCode(stdout: string): string {
  const envelope = parseEnvelope(stdout);
  if (envelope.ok) {
    throw new Error("Expected a failure envelope");
  }
  expect(envelope.command).toBe("translate");
  return envelope.code;
}

describe("network policy (keyless, no network)", () => {
  it("refuses a hosted provider under a local-only config before any request", async () => {
    const dir = await scaffold("network-local-only", { policy: "local-only" });

    const result = await runVerbatra(consumer, ["translate", "--json", "--cwd", dir], {
      env: offlineEnv,
    });

    expect(result.exitCode).toBe(2);
    expect(refusalCode(result.stdout)).toBe("NETWORK_POLICY_VIOLATION");
    expect(result.stdout).toContain("api.anthropic.com");
    expect(`${result.stdout}${result.stderr}`).not.toContain("network call was attempted");
    expect(`${result.stdout}${result.stderr}`).not.toContain("ANTHROPIC_API_KEY");
    await expect(access(join(dir, "locales", "de.json"))).rejects.toThrow();
  });

  it("refuses through VERBATRA_NETWORK_POLICY when the config sets no policy", async () => {
    const dir = await scaffold("network-env-pin");

    const result = await runVerbatra(consumer, ["translate", "--json", "--cwd", dir], {
      env: { ...offlineEnv, VERBATRA_NETWORK_POLICY: "local-only" },
    });

    expect(result.exitCode).toBe(2);
    expect(refusalCode(result.stdout)).toBe("NETWORK_POLICY_VIOLATION");
    expect(result.stdout).toContain("VERBATRA_NETWORK_POLICY");
  });

  it("fails closed on a mistyped VERBATRA_NETWORK_POLICY", async () => {
    const dir = await scaffold("network-env-typo");

    const result = await runVerbatra(consumer, ["translate", "--json", "--cwd", dir], {
      env: { ...offlineEnv, VERBATRA_NETWORK_POLICY: "local_only" },
    });

    expect(result.exitCode).toBe(2);
    expect(refusalCode(result.stdout)).toBe("CONFIG_INVALID");
  });

  it("reports the refusal from doctor without resolving or calling anything", async () => {
    const dir = await scaffold("network-doctor", { policy: "local-only" });

    const result = await runVerbatra(consumer, ["doctor", "--json", "--cwd", dir], {
      env: offlineEnv,
    });

    expect(result.exitCode).not.toBe(0);
    const envelope = parseEnvelope<DoctorJson>(result.stdout);
    const check = envelope.ok
      ? envelope.result.checks.find((entry) => entry.id === "network-policy")
      : undefined;
    expect(check?.status).toBe("fail");
    expect(check?.detail).toContain("api.anthropic.com");
    expect(result.stderr).not.toContain("network call was attempted");
  });

  it("runs under a network guard that is really live, including DNS", async () => {
    const probe = await execa(
      process.execPath,
      ["-e", "require('node:dns').promises.lookup('example.com')"],
      { env: { ...process.env, ...offlineEnv }, reject: false },
    );

    expect(probe.exitCode).not.toBe(0);
    expect(probe.stderr).toContain("network call was attempted");
  });
});
