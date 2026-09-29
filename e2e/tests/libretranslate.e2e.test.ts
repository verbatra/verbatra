import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  makeConsumer,
  parseEnvelope,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

const NO_KEY = { LIBRETRANSLATE_API_KEY: "" };

let consumer: Consumer;

beforeAll(async () => {
  consumer = await makeConsumer();
}, 180_000);

async function seed(baseUrl: string): Promise<void> {
  const init = await runVerbatra(
    consumer,
    [
      "init",
      "--provider",
      "libretranslate",
      "--base-url",
      baseUrl,
      "--format",
      "i18next-json",
      "--source",
      "en",
      "--targets",
      "de",
      "--path",
      "locales/{locale}.json",
      "--yes",
      "--json",
      "--cwd",
      consumer.dir,
    ],
    { env: NO_KEY },
  );
  expect(init.exitCode, init.stderr).toBe(0);
  await writeJsonIn(consumer.dir, "locales/en.json", { greeting: "Hello {{name}}" });
}

describe("libretranslate without a server or a key", () => {
  it("scaffolds, passes doctor's key check, and estimates characters at no cost", async () => {
    await seed("http://127.0.0.1:1");

    const doctor = await runVerbatra(consumer, ["doctor", "--json", "--cwd", consumer.dir], {
      env: { ...NO_KEY, VERBATRA_NETWORK_POLICY: "local-only" },
    });
    const report = parseEnvelope<{
      checks: ReadonlyArray<{ id: string; status: string }>;
    }>(doctor.stdout.trim());
    expect(report.ok, doctor.stderr).toBe(true);
    if (!report.ok) {
      return;
    }
    const statusOf = (id: string): string | undefined =>
      report.result.checks.find((check) => check.id === id)?.status;
    expect(statusOf("api-key")).toBe("pass");
    expect(statusOf("network-policy")).toBe("pass");
    expect(statusOf("locales")).toBe("pass");

    const estimate = await runVerbatra(
      consumer,
      ["translate", "--estimate", "--json", "--cwd", consumer.dir],
      { env: NO_KEY },
    );
    expect(estimate.exitCode, estimate.stderr).toBe(0);
    const envelope = parseEnvelope<{ estimate: { unit: string; pricing: string } }>(
      estimate.stdout.trim(),
    );
    expect(envelope.ok).toBe(true);
    if (envelope.ok) {
      expect(envelope.result.estimate.unit).toBe("characters");
      expect(envelope.result.estimate.pricing).toBe("not-billed");
    }
  });

  it("refuses the server before sending anything when the network policy does not permit it", async () => {
    const result = await runVerbatra(consumer, ["translate", "--json", "--cwd", consumer.dir], {
      env: {
        ...NO_KEY,
        VERBATRA_NETWORK_POLICY: "allowlist",
        VERBATRA_NETWORK_ALLOWED_HOSTS: "10.0.0.1",
      },
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("NETWORK_POLICY_VIOLATION");
  });
});
