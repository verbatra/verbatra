import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { check } from "./check.js";

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), {
    contact: "Write to ops@acme.io",
    falcon: "Project Falcon",
    greeting: "Hello",
    phone: "Call +4930123456789",
  });
  await writeJsonFile(join(dir, "locales", "de.json"), {});
  await writeJsonFile(join(dir, "locales", "fr.json"), {});
  return dir;
}

function cfg(overrides: Partial<VerbatraConfig> = {}): VerbatraConfig {
  return baseConfig({
    targetLocales: ["de", "fr"],
    glossary: {
      version: 2,
      terms: [
        { source: "Falcon", target: "Falke" },
        { source: "account", targets: { de: "Konto", fr: "compte" } },
      ],
      doNotTranslate: ["root@acme.io"],
    },
    ...overrides,
  });
}

describe("check with sensitive", () => {
  it("is absent unless asked for", async () => {
    const summary = await check({ config: cfg(), cwd: await project() });

    expect(summary.sensitive).toBe(undefined);
  });

  it("scans with the default detectors when the block is absent, naming keys and detectors only", async () => {
    const summary = await check({ config: cfg(), cwd: await project(), sensitive: true });

    expect(summary.sensitive).toEqual({
      findings: [{ key: "contact", fields: ["value"], detectors: ["email"] }],
      glossaryTerms: 1,
    });
  });

  it("uses the configured detectors, patterns and allow list whatever the mode says", async () => {
    const config = cfg({
      sensitiveData: {
        mode: "off",
        detectors: ["email", "phone"],
        patterns: ["Falcon"],
        allow: ["*@acme.io"],
      },
    });
    const summary = await check({ config, cwd: await project(), sensitive: true });

    expect(summary.sensitive?.findings.map((finding) => finding.key)).toEqual(["falcon", "phone"]);
    expect(summary.sensitive?.glossaryTerms).toBe(1);
  });

  it("scans the key name too, even for a provider that never receives it", async () => {
    const dir = await project();
    await writeJsonFile(join(dir, "locales", "en.json"), { FalconTitle: "Title" });
    const config = cfg({
      provider: { id: "deepl", options: {} },
      sensitiveData: { mode: "block", patterns: ["Falcon"] },
    });
    const summary = await check({ config, cwd: dir, sensitive: true });

    expect(summary.sensitive?.findings).toEqual([
      { key: "FalconTitle", fields: ["key"], detectors: ["pattern"] },
    ]);
  });
});
