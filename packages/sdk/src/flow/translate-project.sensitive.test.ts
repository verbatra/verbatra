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
import { editEntry } from "./edit-entry.js";
import { retranslateEntry } from "./retranslate-entry.js";
import type { LocaleSummary } from "./summary.js";
import { translate } from "./translate-project.js";

const SOURCE = {
  contact: "Write to ops@acme.io",
  copy: "Write to ops@acme.io",
  greeting: "Hello",
};

async function project(target: Record<string, string> = {}): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), SOURCE);
  await writeJsonFile(join(dir, "locales", "de.json"), target);
  return dir;
}

function cfg(overrides: Partial<VerbatraConfig> = {}): VerbatraConfig {
  return baseConfig({ targetLocales: ["de"], ...overrides });
}

async function run(
  config: VerbatraConfig,
  options: { dryRun?: boolean; translate?: (value: string) => string; dir?: string } = {},
) {
  const dir = options.dir ?? (await project());
  const stub = makeStubProvider(
    options.translate === undefined
      ? {}
      : { translate: (value) => options.translate?.(value) ?? value },
  );
  const summary = await translate(
    { config, cwd: dir, ...(options.dryRun === true ? { dryRun: true } : {}) },
    { createProvider: () => stub.provider },
  );
  const locale = summary.locales[0] as LocaleSummary;
  return { dir, stub, summary, locale, sent: JSON.stringify(stub.calls) };
}

function codes(locale: LocaleSummary): string[] {
  return locale.notices.map((notice) => notice.code);
}

describe("translate with sensitiveData", () => {
  it("does nothing when the block is absent", async () => {
    const { locale, sent } = await run(cfg());

    expect(locale.status).toBe("succeeded");
    expect(locale.sensitiveWithheld).toEqual([]);
    expect(codes(locale).filter((code) => code.startsWith("SENSITIVE"))).toEqual([]);
    expect(sent).toContain("ops@acme.io");
  });

  it("warn sends unchanged and names the keys and detectors, never the matched text", async () => {
    const { locale, sent } = await run(cfg({ sensitiveData: { mode: "warn" } }));
    const notice = locale.notices.find((item) => item.code === "SENSITIVE_CONTENT_SENT");

    expect(locale.status).toBe("succeeded");
    expect(sent).toContain("ops@acme.io");
    expect(notice?.message).toContain('"contact"');
    expect(notice?.message).toContain("(email)");
    expect(notice?.message).not.toContain("ops@acme.io");
  });

  it("block sends nothing for the key or its content duplicates and ends the locale partial", async () => {
    const { locale, sent } = await run(cfg({ sensitiveData: { mode: "block" } }));

    expect(sent).not.toContain("ops@acme.io");
    expect(locale.status).toBe("partial");
    expect(locale.translated).toEqual(["greeting"]);
    expect(locale.sensitiveWithheld).toEqual(["contact", "copy"]);
    expect(locale.providerFailures).toEqual([]);
    expect(codes(locale)).toContain("SENSITIVE_CONTENT_WITHHELD");
  });

  it("block leaves the withheld keys pending, so the next run reports them again", async () => {
    const first = await run(cfg({ sensitiveData: { mode: "block" } }));
    const second = await run(cfg({ sensitiveData: { mode: "block" } }), { dir: first.dir });

    expect(second.locale.sensitiveWithheld).toEqual(["contact", "copy"]);
    expect(second.locale.unchanged).toEqual(["greeting"]);
  });

  it("an allowed match is sent like any other text", async () => {
    const { locale } = await run(cfg({ sensitiveData: { mode: "block", allow: ["*@acme.io"] } }));

    expect(locale.status).toBe("succeeded");
    expect(locale.sensitiveWithheld).toEqual([]);
  });

  it("a dry run reports what a live run would withhold", async () => {
    const { locale, stub } = await run(cfg({ sensitiveData: { mode: "block" } }), { dryRun: true });

    expect(stub.calls).toHaveLength(0);
    expect(locale.translated).toEqual(["greeting"]);
    expect(locale.sensitiveWithheld).toEqual(["contact", "copy"]);
    expect(codes(locale)).toContain("SENSITIVE_CONTENT_WITHHELD");
  });

  it("a dry run under warn names the keys too", async () => {
    const { locale } = await run(cfg({ sensitiveData: { mode: "warn" } }), { dryRun: true });

    expect(codes(locale)).toContain("SENSITIVE_CONTENT_SENT");
  });

  it("redact sends no matched text and writes the restored translation", async () => {
    const { dir, locale, sent } = await run(cfg({ sensitiveData: { mode: "redact" } }));
    const written = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;

    expect(sent).not.toContain("ops@acme.io");
    expect(locale.status).toBe("succeeded");
    expect(written.contact).toBe("[de] Write to ops@acme.io");
    expect(written.copy).toBe("[de] Write to ops@acme.io");
    expect(codes(locale)).toContain("SENSITIVE_CONTENT_REDACTED");
  });

  it("redact withholds a key whose token did not come back, not as a provider failure", async () => {
    const { locale } = await run(cfg({ sensitiveData: { mode: "redact" } }), {
      translate: (value) => value.replace("__VBR0__", "?"),
    });

    expect(locale.status).toBe("partial");
    expect(locale.sensitiveWithheld).toEqual(["contact", "copy"]);
    expect(locale.providerFailures).toEqual([]);
    expect(codes(locale)).toEqual(expect.arrayContaining(["SENSITIVE_CONTENT_WITHHELD"]));
    expect(codes(locale)).not.toContain("SENSITIVE_CONTENT_REDACTED");
  });

  it("reports a withheld suggestion under humanEdits suggest as sensitive-withheld", async () => {
    const dir = await project();
    const config = cfg({ sensitiveData: { mode: "block" }, humanEdits: "suggest" });
    await editEntry({ config, cwd: dir, locale: "de", key: "contact", value: "Schreib uns" });
    await writeJsonFile(join(dir, "locales", "en.json"), {
      ...SOURCE,
      contact: "Write to ops@acme.io today",
    });
    const { locale } = await run(config, { dir });
    const contact = locale.protected.find((item) => item.key === "contact");

    expect(contact?.suggestionStatus).toBe("sensitive-withheld");
    expect(locale.sensitiveWithheld).toEqual([]);
    expect(locale.status).toBe("succeeded");
  });
});

describe("retranslateEntry with sensitiveData", () => {
  async function retranslate(config: VerbatraConfig, transform?: (value: string) => string) {
    const dir = await project({ contact: "Alt" });
    const stub = makeStubProvider(transform === undefined ? {} : { translate: transform });
    const result = retranslateEntry(
      { config, cwd: dir, locale: "de", key: "contact" },
      { createProvider: () => stub.provider },
    );
    return { stub, result };
  }

  it("block refuses before the provider is called", async () => {
    const { stub, result } = await retranslate(cfg({ sensitiveData: { mode: "block" } }));

    await expect(result).rejects.toMatchObject({ code: "SENSITIVE_CONTENT_WITHHELD" });
    expect(stub.calls).toHaveLength(0);
  });

  it("redact sends a token and writes the restored value", async () => {
    const { stub, result } = await retranslate(cfg({ sensitiveData: { mode: "redact" } }));

    await expect(result).resolves.toMatchObject({ accepted: true });
    expect(JSON.stringify(stub.calls)).not.toContain("ops@acme.io");
  });

  it("redact refuses a token that did not come back", async () => {
    const { result } = await retranslate(cfg({ sensitiveData: { mode: "redact" } }), () => "x");

    await expect(result).rejects.toMatchObject({ code: "SENSITIVE_CONTENT_WITHHELD" });
  });

  it("a missing value without a redaction is still a provider error", async () => {
    const dir = await project({ greeting: "Alt" });
    const stub = makeStubProvider({ missingValues: new Set(["greeting"]) });

    await expect(
      retranslateEntry(
        {
          config: cfg({ sensitiveData: { mode: "redact" } }),
          cwd: dir,
          locale: "de",
          key: "greeting",
        },
        { createProvider: () => stub.provider },
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
