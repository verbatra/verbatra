import * as sdk from "@verbatra/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main, parseMode } from "./cli.ts";
import { PLAYGROUND_KEY_VAR, PROVIDER_KEY_VAR } from "./limits.ts";
import { dryRun, refuseProvider } from "./run.ts";
import { PLAYGROUND_LANGUAGES, PLAYGROUND_SOURCE } from "./source.ts";
import { cliHarness, createStubProvider } from "./test-support.ts";

vi.mock("@verbatra/sdk", async (importOriginal) => {
  const original = await importOriginal<typeof import("@verbatra/sdk")>();
  return { ...original, translate: vi.fn(original.translate) };
});

const FAKE_KEY = ["fake", "playground", "value", "for", "tests"].join("-");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(sdk.translate).mockClear();
});

function forbidFetch() {
  const fetchSpy = vi.fn(() => {
    throw new Error("network is forbidden in this test");
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("parseMode", () => {
  it("defaults to a dry run and accepts only --write", () => {
    expect(parseMode([])).toBe("dry-run");
    expect(parseMode(["--write"])).toBe("write");
    expect(() => parseMode(["--path", "x"])).toThrow(/only accepted argument/);
    expect(() => parseMode(["--write", "--force"])).toThrow(/only accepted argument/);
  });
});

describe("main: dry run", () => {
  it("dry run makes zero network calls and zero provider calls", async () => {
    const fetchSpy = forbidFetch();
    const stub = createStubProvider();
    const harness = cliHarness({ createProvider: stub.createProvider });
    expect(await main(harness.deps)).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stub.constructed()).toBe(0);
    expect(stub.sent).toHaveLength(0);
    expect(harness.written).toHaveLength(0);
    const calls = vi.mocked(sdk.translate).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [input] of calls) {
      expect(input).toMatchObject({ estimate: true, dryRun: true });
    }
  });

  it("prints the items, languages, model, planned pairs and estimated requests", async () => {
    forbidFetch();
    const harness = cliHarness();
    await main(harness.deps);
    const text = harness.stdout.join("\n");
    expect(text).toContain('welcome: "Welcome back, {name}!"');
    expect(text).toContain("Languages: de, es, fr, ja");
    expect(text).toContain("gemini-2.5-flash");
    expect(text).toContain("Planned pairs (40):");
    expect(text).toContain("Estimated requests (one per language batch): 4");
    expect(text).toContain("SDK estimate: 4 requests for 40 keys");
  });

  it("does not copy the playground key in a dry run", async () => {
    forbidFetch();
    const env: Record<string, string | undefined> = { [PLAYGROUND_KEY_VAR]: FAKE_KEY };
    await main(cliHarness({ env }).deps);
    expect(env[PROVIDER_KEY_VAR]).toBeUndefined();
  });
});

describe("dryRun wiring", () => {
  it("passes refuseProvider to translate when no provider is injected, and fetches nothing", async () => {
    const fetchSpy = forbidFetch();
    await dryRun({
      items: PLAYGROUND_SOURCE,
      languages: PLAYGROUND_LANGUAGES,
      existing: undefined,
      sdkVersion: "0.0.0-test",
      now: () => new Date(),
    });
    const calls = vi.mocked(sdk.translate).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]?.createProvider).toBe(refuseProvider);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("main: refusals", () => {
  it.each([
    ["CI", { env: { CI: "1" } }],
    ["production", { env: { NODE_ENV: "production" } }],
    ["Docker", { insideContainer: true }],
    ["no TTY", { isTTY: false }],
    ["GEMINI_API_KEY set", { env: { [PROVIDER_KEY_VAR]: FAKE_KEY } }],
    ["an unknown argument", { argv: ["--locale", "it"] }],
    ["a disallowed language", { languages: ["it"] }],
    ["a sensitive item", { items: [{ id: "mail", text: "jane@example.org" }] }],
  ])("refuses with exit code 2 and sends nothing: %s", async (_label, overrides) => {
    const fetchSpy = forbidFetch();
    const harness = cliHarness(overrides);
    expect(await main(harness.deps)).toBe(2);
    expect(harness.stderr.join("\n")).toMatch(/Refusing|only accepted|allowlist|looks like/);
    expect(harness.stderr.join("\n")).not.toContain(FAKE_KEY);
    expect(sdk.translate).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses --write without the playground key", async () => {
    const harness = cliHarness({ argv: ["--write"] });
    expect(await main(harness.deps)).toBe(2);
    expect(harness.stderr.join("\n")).toContain(PLAYGROUND_KEY_VAR);
  });
});

describe("main: --write", () => {
  it("writes the validated output once", async () => {
    const stub = createStubProvider();
    const env: Record<string, string | undefined> = { [PLAYGROUND_KEY_VAR]: FAKE_KEY };
    const harness = cliHarness({ argv: ["--write"], env, createProvider: stub.createProvider });
    expect(await main(harness.deps)).toBe(0);
    expect(harness.written).toHaveLength(1);
    expect(JSON.parse(harness.written[0] ?? "{}")).toHaveProperty(
      "metadata.model",
      "gemini-2.5-flash",
    );
    expect(harness.stdout.join("\n")).not.toContain(FAKE_KEY);
  });

  it("leaves the existing JSON untouched when one result fails", async () => {
    const stub = createStubProvider({
      transform: (value, locale) => (value === "Settings" ? "Settings" : `${locale}: ${value}`),
    });
    const env = { [PLAYGROUND_KEY_VAR]: FAKE_KEY };
    const harness = cliHarness({ argv: ["--write"], env, createProvider: stub.createProvider });
    expect(await main(harness.deps)).toBe(1);
    expect(harness.written).toHaveLength(0);
    expect(harness.stderr.join("\n")).toContain("Nothing was written");
  });

  it("aborts on a provider retry with status 429 and keeps the JSON", async () => {
    const stub = createStubProvider({
      beforeReply: (hooks) => hooks?.onRetry?.({ attempt: 2, delayMs: 250, status: 429 }),
    });
    const env = { [PLAYGROUND_KEY_VAR]: FAKE_KEY };
    const harness = cliHarness({ argv: ["--write"], env, createProvider: stub.createProvider });
    expect(await main(harness.deps)).toBe(1);
    expect(stub.sent).toHaveLength(1);
    expect(harness.written).toHaveLength(0);
    expect(harness.stderr.join("\n")).toContain("rate-limited");
  });

  it("aborts on a non-429 provider failure and reports it as a provider failure, redacted", async () => {
    const googleShapedKey = `AIza${"Sy0123456789abcdefghijklmnopqrstuvw"}`;
    const stub = createStubProvider({
      failBatch: () => new sdk.ProviderError("AUTH_FAILED", `API key ${googleShapedKey} not valid`),
    });
    const env = { [PLAYGROUND_KEY_VAR]: FAKE_KEY };
    const harness = cliHarness({ argv: ["--write"], env, createProvider: stub.createProvider });
    expect(await main(harness.deps)).toBe(1);
    expect(stub.sent).toHaveLength(1);
    expect(harness.written).toHaveLength(0);
    const printed = harness.stderr.join("\n");
    expect(printed).toContain("The provider failed");
    expect(printed).toContain("AUTH_FAILED");
    expect(printed).not.toContain("failed validation");
    expect(printed).not.toContain(googleShapedKey);
    expect(printed).not.toContain(FAKE_KEY);
  });

  it("redacts a provider error before printing it", async () => {
    const env = { [PLAYGROUND_KEY_VAR]: FAKE_KEY };
    const harness = cliHarness({
      argv: ["--write"],
      env,
      createProvider: () => {
        throw new Error(`bad key ${FAKE_KEY}`);
      },
    });
    expect(await main(harness.deps)).toBe(1);
    const printed = [...harness.stdout, ...harness.stderr].join("\n");
    expect(printed).not.toContain(FAKE_KEY);
  });
});
