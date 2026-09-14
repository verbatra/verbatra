import { afterEach, describe, expect, it } from "vitest";
import { JSON_ENVELOPE_VERSION } from "./json-envelope.js";
import { run } from "./run.js";
import { captureStreams, makePseudoResult, parseEnvelope, recordingDeps } from "./test-support.js";

const API_KEY_VARIABLE = /_API_KEY$/;

function apiKeyVariables(): readonly string[] {
  return Object.keys(process.env).filter((name) => API_KEY_VARIABLE.test(name));
}

describe("run pseudo: SDK delegation, rendering, and exit codes", () => {
  it("delegates to pseudolocalize with the resolved cwd and exits 0", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["pseudo", "--cwd", "/proj"], deps, cap.streams);

    expect(code).toBe(0);
    expect(calls.pseudolocalize).toHaveLength(1);
    expect(calls.pseudolocalize[0]).toMatchObject({ cwd: "/proj" });
  });

  it("passes --locale and --out through to the SDK", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["pseudo", "--locale", "en-XB", "--out", "build/pseudo"], deps, cap.streams);

    expect(calls.pseudolocalize[0]).toMatchObject({ locale: "en-XB", out: "build/pseudo" });
  });

  it("omits the optional inputs when the flags are absent", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["pseudo"], deps, cap.streams);

    expect(calls.pseudolocalize[0]).not.toHaveProperty("locale");
    expect(calls.pseudolocalize[0]).not.toHaveProperty("out");
  });

  it("prints what was generated and where it went", async () => {
    const result = makePseudoResult({
      locale: "en-XA",
      path: "/proj/.verbatra-local/pseudo/locales/en-XA.json",
      entries: 12,
      transformed: 12,
    });
    const { deps } = recordingDeps({ pseudolocalize: async () => result });
    const cap = captureStreams();

    await run(["pseudo"], deps, cap.streams);

    expect(cap.out()).toContain("verbatra pseudo");
    expect(cap.out()).toContain("en-XA: 12 of 12 entries pseudolocalized");
    expect(cap.out()).toContain("wrote /proj/.verbatra-local/pseudo/locales/en-XA.json");
  });

  it("names the keys it had to copy verbatim", async () => {
    const result = makePseudoResult({ entries: 3, transformed: 1, copied: ["a.b", "c"] });
    const { deps } = recordingDeps({ pseudolocalize: async () => result });
    const cap = captureStreams();

    await run(["pseudo"], deps, cap.streams);

    expect(cap.out()).toContain("copied verbatim: a.b, c");
  });

  it("reports a second, unchanged run rather than claiming a write", async () => {
    const result = makePseudoResult({ written: false });
    const { deps } = recordingDeps({ pseudolocalize: async () => result });
    const cap = captureStreams();

    const code = await run(["pseudo"], deps, cap.streams);

    expect(code).toBe(0);
    expect(cap.out()).toContain("unchanged");
    expect(cap.out()).not.toContain("wrote");
  });

  it("--json prints the result as one JSON envelope", async () => {
    const result = makePseudoResult({ entries: 2, transformed: 2 });
    const { deps } = recordingDeps({ pseudolocalize: async () => result });
    const cap = captureStreams();

    await run(["pseudo", "--json"], deps, cap.streams);
    const envelope = parseEnvelope(cap.out());

    expect(envelope).toMatchObject({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "pseudo",
      result: { locale: "en-XA", entries: 2, transformed: 2 },
    });
  });

  it("exits 2 with the structured code when the SDK refuses the run", async () => {
    const error = Object.assign(new Error("that path is a configured locale file"), {
      code: "PSEUDO_OUTPUT_CONFLICT",
    });
    const { deps } = recordingDeps({
      pseudolocalize: async () => {
        throw error;
      },
    });
    const cap = captureStreams();

    const code = await run(["pseudo", "--out", "locales"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[PSEUDO_OUTPUT_CONFLICT]");
  });

  it.each(["", "en XA", "en/../XA", 'en"XA'])(
    "rejects the malformed locale %o as a usage error",
    async (locale) => {
      const { deps, calls } = recordingDeps();
      const cap = captureStreams();

      const code = await run(["pseudo", "--locale", locale], deps, cap.streams);

      expect(code).toBe(2);
      expect(calls.pseudolocalize).toHaveLength(0);
      expect(cap.err()).toContain("[INVALID_LOCALE]");
    },
  );

  it("names the offending locale in the structured error rather than dumping a schema report", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    await run(["pseudo", "--locale", "en XA", "--json"], deps, cap.streams);

    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: false,
      command: "pseudo",
      code: "INVALID_LOCALE",
    });
    expect(cap.out()).not.toContain("invalid_format");
  });

  it("rejects a blank --out as a usage error", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["pseudo", "--out", "  "], deps, cap.streams);

    expect(code).toBe(2);
    expect(calls.pseudolocalize).toHaveLength(0);
    expect(cap.err()).toContain("[INVALID_OUT]");
  });
});

describe("run pseudo: it spends nothing", () => {
  const originalEnv = new Map(apiKeyVariables().map((name) => [name, process.env[name]]));

  afterEach(() => {
    for (const [name, value] of originalEnv) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("runs with every API key variable removed from the environment", async () => {
    for (const name of apiKeyVariables()) {
      delete process.env[name];
    }
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["pseudo"], deps, cap.streams);

    expect(code).toBe(0);
    expect(calls.pseudolocalize).toHaveLength(1);
  });
});
