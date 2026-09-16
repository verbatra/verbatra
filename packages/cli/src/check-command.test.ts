import { describe, expect, it } from "vitest";
import { JSON_ENVELOPE_VERSION } from "./json-envelope.js";
import { run } from "./run.js";
import { captureStreams, makeCheckSummary, parseEnvelope, recordingDeps } from "./test-support.js";

describe("run check: SDK delegation, rendering, and exit codes", () => {
  it("delegates to check with the resolved cwd and exits 0 when in sync", async () => {
    const summary = makeCheckSummary({
      inSync: true,
      locales: [{ locale: "de", missing: 0, stale: 0, upToDate: 5, inSync: true }],
    });
    const { deps, calls } = recordingDeps({ check: async () => summary });
    const cap = captureStreams();

    const code = await run(["check", "--cwd", "/proj"], deps, cap.streams);

    expect(code).toBe(0);
    expect(calls.check).toHaveLength(1);
    expect(calls.check[0]).toMatchObject({ cwd: "/proj" });
    expect(cap.out()).toContain("verbatra check");
    expect(cap.out()).toContain("de: 0 missing, 0 stale, 5 up-to-date (in sync)");
    expect(cap.out()).toContain("all locales in sync");
  });

  it("exits 1 when at least one locale is out of sync, still printing the report", async () => {
    const summary = makeCheckSummary({
      inSync: false,
      locales: [
        { locale: "de", missing: 3, stale: 1, upToDate: 120, inSync: false },
        { locale: "fr", missing: 0, stale: 0, upToDate: 124, inSync: true },
      ],
    });
    const { deps } = recordingDeps({ check: async () => summary });
    const cap = captureStreams();

    const code = await run(["check"], deps, cap.streams);

    expect(code).toBe(1);
    expect(cap.out()).toContain("de: 3 missing, 1 stale, 120 up-to-date (out of sync)");
    expect(cap.out()).toContain("fr: 0 missing, 0 stale, 124 up-to-date (in sync)");
    expect(cap.out()).toContain("out of sync (run verbatra translate to update)");
  });

  it("parses --locales into the SDK call", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["check", "--locales", "de, fr ,"], deps, cap.streams);

    expect(calls.check[0]).toMatchObject({ locales: ["de", "fr"] });
  });

  it("--json prints the check summary as one JSON line", async () => {
    const summary = makeCheckSummary({
      inSync: false,
      locales: [{ locale: "de", missing: 1, stale: 0, upToDate: 2, inSync: false }],
    });
    const { deps } = recordingDeps({ check: async () => summary });
    const cap = captureStreams();

    const code = await run(["check", "--json"], deps, cap.streams);

    expect(code).toBe(1);
    expect(parseEnvelope(cap.out())).toEqual({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "check",
      result: summary,
    });
  });

  it("forwards --config to loadConfig", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["check", "--config", "verbatra.config.ts"], deps, cap.streams);

    expect(calls.loadConfig[0]).toMatchObject({ configPath: "verbatra.config.ts" });
  });

  it("a whole-run error renders to stderr and exits 2 with clean stdout", async () => {
    const { deps } = recordingDeps({
      check: async () => {
        throw Object.assign(new Error("bad source"), { code: "SOURCE_INVALID" });
      },
    });
    const cap = captureStreams();

    const code = await run(["check"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[SOURCE_INVALID]");
    expect(cap.out()).toBe("");
  });

  it("rejects an empty --locales list as a usage error: exit 2, stderr, clean stdout, no SDK call", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["check", "--locales", ""], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[INVALID_LOCALES]");
    expect(cap.out()).toBe("");
    expect(calls.check).toHaveLength(0);
  });

  it("rejects a comma-only --locales list (all entries empty) as a usage error", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["check", "--locales", ","], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[INVALID_LOCALES]");
    expect(cap.out()).toBe("");
    expect(calls.check).toHaveLength(0);
  });

  it("passes an unknown but non-empty --locales through, and the SDK UNKNOWN_LOCALE exits 2", async () => {
    const { deps, calls } = recordingDeps({
      check: async () => {
        throw Object.assign(new Error("Requested locale not in configured targets: fr."), {
          code: "UNKNOWN_LOCALE",
        });
      },
    });
    const cap = captureStreams();

    const code = await run(["check", "--locales", "fr"], deps, cap.streams);

    expect(code).toBe(2);
    expect(calls.check[0]).toMatchObject({ locales: ["fr"] });
    expect(cap.err()).toContain("[UNKNOWN_LOCALE]");
    expect(cap.out()).toBe("");
  });
});

describe("run check --consistency: report only", () => {
  const inconsistent = makeCheckSummary({
    inSync: true,
    locales: [
      {
        locale: "de",
        missing: 0,
        stale: 0,
        upToDate: 2,
        inSync: true,
        inconsistencies: [
          {
            source: "Save",
            isPlural: false,
            translations: [
              { value: "Sichern", keys: ["toolbar.save"] },
              { value: "Speichern", keys: ["actions.save"] },
            ],
          },
        ],
      },
    ],
  });

  it("asks the SDK for the report only when the flag is given", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["check"], deps, cap.streams);
    await run(["check", "--consistency"], deps, cap.streams);

    expect(calls.check[0]).not.toHaveProperty("consistency");
    expect(calls.check[1]).toMatchObject({ consistency: true });
  });

  it("prints the findings and still exits 0 for an in-sync project", async () => {
    const { deps } = recordingDeps({ check: async () => inconsistent });
    const cap = captureStreams();

    const code = await run(["check", "--consistency"], deps, cap.streams);

    expect(code).toBe(0);
    expect(cap.out()).toContain('"Save" is translated 2 ways:');
    expect(cap.out()).toContain('"Speichern": actions.save');
  });

  it("keeps exit 1 driven by drift alone", async () => {
    const { deps } = recordingDeps({
      check: async () => ({
        inSync: false,
        locales: [
          { locale: "de", missing: 1, stale: 0, upToDate: 1, inSync: false, inconsistencies: [] },
        ],
      }),
    });
    const cap = captureStreams();

    expect(await run(["check", "--consistency"], deps, cap.streams)).toBe(1);
  });

  it("carries the groups inside the JSON envelope's result", async () => {
    const { deps } = recordingDeps({ check: async () => inconsistent });
    const cap = captureStreams();

    const code = await run(["check", "--consistency", "--json"], deps, cap.streams);

    expect(code).toBe(0);
    expect(parseEnvelope(cap.out())).toEqual({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "check",
      result: inconsistent,
    });
  });
});
