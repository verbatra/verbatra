import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ScaffoldableProviderId,
  scaffoldingMetadata,
  verbatraConfigSchema,
} from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type InitDeps, runInit } from "./init.js";
import { captureStreams } from "./test-support.js";

const nonInteractive: InitDeps = { isTty: () => false };

const SCAFFOLDABLE_PROVIDERS = Object.keys(
  scaffoldingMetadata.providerEnv,
) as ScaffoldableProviderId[];

function evaluateRenderedConfig(text: string): unknown {
  const body = text
    .split("\n")
    .filter((line) => !line.startsWith("import "))
    .join("\n")
    .replace("export default defineConfig(", "return (");
  const load = new Function(body) as () => unknown;
  return load();
}

describe("the scaffolded verbatra.config.ts", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verbatra-rendered-config-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(SCAFFOLDABLE_PROVIDERS)(
    "parses back into a config the schema accepts for %s",
    async (provider) => {
      const cap = captureStreams();
      const code = await runInit({ cwd: dir, yes: true, provider }, cap.streams, nonInteractive);
      expect(code).toBe(0);

      const rendered = evaluateRenderedConfig(
        readFileSync(join(dir, "verbatra.config.ts"), "utf8"),
      );
      const parsed = verbatraConfigSchema.safeParse(rendered);

      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
    },
  );

  it.each(SCAFFOLDABLE_PROVIDERS)(
    "turns on the sensitive-content warning for %s",
    async (provider) => {
      const code = await runInit(
        { cwd: dir, yes: true, provider },
        captureStreams().streams,
        nonInteractive,
      );
      expect(code).toBe(0);

      const rendered = evaluateRenderedConfig(
        readFileSync(join(dir, "verbatra.config.ts"), "utf8"),
      ) as { sensitiveData?: unknown };

      expect(rendered.sensitiveData).toEqual({ mode: "warn" });
    },
  );

  it.each(SCAFFOLDABLE_PROVIDERS)(
    "renders exactly the provider options that were validated for %s",
    async (provider) => {
      const cap = captureStreams();
      await runInit({ cwd: dir, yes: true, provider }, cap.streams, nonInteractive);

      const rendered = evaluateRenderedConfig(
        readFileSync(join(dir, "verbatra.config.ts"), "utf8"),
      );
      const parsed = verbatraConfigSchema.parse(rendered);

      expect(parsed.provider.id).toBe(provider);
      expect(Object.keys(parsed.provider.options)).toEqual(
        Object.keys((rendered as { provider: { options: object } }).provider.options),
      );
    },
  );

  it("parses back into a human-only config for provider none", async () => {
    const cap = captureStreams();
    const code = await runInit(
      { cwd: dir, yes: true, provider: "none" },
      cap.streams,
      nonInteractive,
    );
    expect(code).toBe(0);

    const rendered = evaluateRenderedConfig(readFileSync(join(dir, "verbatra.config.ts"), "utf8"));

    expect(verbatraConfigSchema.parse(rendered).provider).toEqual({ id: "none", options: {} });
    expect(verbatraConfigSchema.parse(rendered).sensitiveData).toBe(undefined);
  });

  it.each(["gemini", "deepl", "none"])(
    "reports in --json exactly the config it wrote for %s",
    async (provider) => {
      const cap = captureStreams();
      const code = await runInit(
        { cwd: dir, yes: true, json: true, provider },
        cap.streams,
        nonInteractive,
      );
      expect(code).toBe(0);

      const envelope = JSON.parse(cap.out()) as { result: { config: unknown } };
      const written = evaluateRenderedConfig(readFileSync(join(dir, "verbatra.config.ts"), "utf8"));

      expect(envelope.result.config).toEqual(written);
    },
  );

  it("names the token limit option each language model provider actually accepts", async () => {
    const cap = captureStreams();
    await runInit({ cwd: dir, yes: true, provider: "anthropic" }, cap.streams, nonInteractive);
    const config = readFileSync(join(dir, "verbatra.config.ts"), "utf8");

    expect(config).toContain("maxTokens: 4096");
    expect(config).not.toContain("maxOutputTokens");
  });
});
