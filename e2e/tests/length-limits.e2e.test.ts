import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";

interface DoctorJson {
  checks: { id: string; status: string; detail: string }[];
  dataFlow?: { local: { id: string; path: string; holdsSourceText: boolean }[] };
}

interface TranslateJson {
  locales: { locale: string; notices: { code: string; message: string }[] }[];
}

let consumer: Consumer;

async function project(name: string, limits?: string): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "anthropic", options: { model: "claude-sonnet-4-6", maxTokens: 4096 } },
  });
  await writeJsonIn(dir, "locales/en.json", { greeting: "Hello", farewell: "Goodbye" });
  await writeJsonIn(dir, "locales/de.json", { greeting: "Hallo" });
  if (limits !== undefined) {
    await writeFileIn(dir, "verbatra.limits.json", limits);
  }
  return dir;
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("length limits in the published binary", () => {
  it("doctor passes the limits check for a file whose keys are all in the source", async () => {
    const dir = await project(
      "limits-ok",
      JSON.stringify({ version: 1, maxLength: { greeting: 12 } }),
    );

    const run = await runVerbatra(consumer, ["doctor", "--json", "--cwd", dir]);

    const envelope = parseEnvelope<DoctorJson>(run.stdout);
    if (!envelope.ok) {
      throw new Error(`Expected a doctor success envelope, got [${envelope.code}]`);
    }
    const check = envelope.result.checks.find((entry) => entry.id === "limits");
    expect(check).toMatchObject({ status: "pass", detail: expect.stringContaining("1 limit") });
  });

  it("doctor warns on an unusable file, and a run says it ignored the file and still succeeds", async () => {
    const dir = await project("limits-corrupt", "{ not json");

    const doctor = await runVerbatra(consumer, ["doctor", "--json", "--cwd", dir]);
    const dryRun = await runVerbatra(consumer, ["translate", "--dry-run", "--json", "--cwd", dir]);

    const doctorEnvelope = parseEnvelope<DoctorJson>(doctor.stdout);
    if (!doctorEnvelope.ok) {
      throw new Error(`Expected a doctor success envelope, got [${doctorEnvelope.code}]`);
    }
    const check = doctorEnvelope.result.checks.find((entry) => entry.id === "limits");
    expect(check?.status).toBe("warn");
    expect(check?.detail).toContain("verbatra.limits.json is not valid JSON");
    expect(dryRun.exitCode).toBe(0);
    const runEnvelope = parseEnvelope<TranslateJson>(dryRun.stdout);
    if (!runEnvelope.ok) {
      throw new Error(`Expected a translate success envelope, got [${runEnvelope.code}]`);
    }
    expect(runEnvelope.result.locales[0]?.notices.map((notice) => notice.code)).toContain(
      "LIMITS_FILE_IGNORED",
    );
  });

  it("check --qa and export say on stderr that an unusable file was ignored", async () => {
    const dir = await project("limits-corrupt-stderr", "{ not json");

    const check = await runVerbatra(consumer, ["check", "--qa", "--cwd", dir]);
    const exported = await runVerbatra(consumer, ["export", "--cwd", dir]);

    expect(check.stderr).toContain("verbatra.limits.json is not valid JSON");
    expect(exported.exitCode).toBe(0);
    expect(exported.stderr).toContain("verbatra.limits.json is not valid JSON");
  });

  it("doctor --data-flow lists the limits file as holding no source text", async () => {
    const dir = await project("limits-data-flow");

    const run = await runVerbatra(consumer, ["doctor", "--data-flow", "--json", "--cwd", dir]);

    const envelope = parseEnvelope<DoctorJson>(run.stdout);
    if (!envelope.ok) {
      throw new Error(`Expected a doctor success envelope, got [${envelope.code}]`);
    }
    expect(envelope.result.dataFlow?.local.find((file) => file.id === "limits")).toMatchObject({
      path: "verbatra.limits.json",
      holdsSourceText: false,
    });
  });
});
