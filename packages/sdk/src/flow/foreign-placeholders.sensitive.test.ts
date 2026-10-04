import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { retranslateEntry } from "./retranslate-entry.js";
import type { LocaleSummary } from "./summary.js";
import { translate } from "./translate-project.js";

const SOURCE = { token: "Your {secretToken} here", greeting: "Hello" };

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), SOURCE);
  await writeJsonFile(join(dir, "locales", "de.json"), {});
  return dir;
}

function cfg(): VerbatraConfig {
  return baseConfig({
    targetLocales: ["de"],
    sensitiveData: { mode: "redact", patterns: ["secretToken"] },
  });
}

function sensitiveView(locale: LocaleSummary) {
  return {
    withheld: locale.sensitiveWithheld,
    notices: locale.notices.filter((notice) => notice.code.startsWith("SENSITIVE_CONTENT_")),
  };
}

describe("a sensitive match inside a foreign placeholder, redacted for an LLM provider", () => {
  it("translate redacts the key instead of withholding it, as the dry run planned", async () => {
    const dir = await project();
    const stub = makeStubProvider();
    const dry = await translate({ config: cfg(), cwd: dir, dryRun: true });

    const live = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    const written = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    const dryLocale = dry.locales[0] as LocaleSummary;
    const liveLocale = live.locales[0] as LocaleSummary;
    expect(JSON.stringify(stub.calls)).not.toContain("secretToken");
    expect(written.token).toBe("[de] Your {secretToken} here");
    expect(liveLocale.status).toBe("succeeded");
    expect(sensitiveView(liveLocale)).toEqual(sensitiveView(dryLocale));
    expect(sensitiveView(liveLocale).withheld).toEqual([]);
    expect(sensitiveView(liveLocale).notices.map((notice) => notice.code)).toEqual([
      "SENSITIVE_CONTENT_REDACTED",
    ]);
  });

  it("retranslateEntry redacts the key instead of withholding it", async () => {
    const dir = await project();
    const stub = makeStubProvider();

    const result = await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "token" },
      { createProvider: () => stub.provider },
    );

    expect(JSON.stringify(stub.calls)).not.toContain("secretToken");
    expect(result.value).toBe("[de] Your {secretToken} here");
  });
});
