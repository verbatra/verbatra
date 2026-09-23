import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import {
  captureStreams,
  makeCheckSummary,
  makeConfig,
  makeLocale,
  makeSummary,
  recordingDeps,
} from "./test-support.js";

const humanOnlyConfig = async () => makeConfig({ provider: { id: "none", options: {} } });

const protectedSummary = makeSummary({
  locales: [
    makeLocale({
      translated: ["farewell"],
      protected: [
        { key: "greeting", reason: "human", suggestion: "Hallo zusammen" },
        { key: "legal.terms", reason: "pinned" },
        { key: "promo.banner", reason: "import", suggestionStatus: "provider-failure" },
      ],
    }),
  ],
  succeeded: ["de"],
});

describe("run translate: protected keys", () => {
  it("passes --include-human to the SDK as humanEdits overwrite", async () => {
    const { deps, calls } = recordingDeps();

    await run(["translate", "--include-human"], deps, captureStreams().streams);
    await run(["translate"], deps, captureStreams().streams);

    expect(calls.translate[0]?.humanEdits).toBe("overwrite");
    expect(calls.translate[1]?.humanEdits).toBeUndefined();
  });

  it("lists protected keys with their reason and suggestion, hints, and exits 0", async () => {
    const { deps } = recordingDeps({ translate: async () => protectedSummary });
    const cap = captureStreams();

    const code = await run(["translate"], deps, cap.streams);

    expect(code).toBe(0);
    expect(cap.out()).toContain("3 protected");
    expect(cap.out()).toContain(
      'greeting (human, suggestion "Hallo zusammen"), legal.terms (pinned), promo.banner (import, suggestion provider-failure)',
    );
    expect(cap.err()).toContain("3 protected keys were left for a person to review");
    expect(cap.err()).toContain("--include-human");
  });

  it("prints no protection hint when nothing was protected", async () => {
    const { deps } = recordingDeps({
      translate: async () => makeSummary({ locales: [makeLocale()], succeeded: ["de"] }),
    });
    const cap = captureStreams();

    await run(["translate"], deps, cap.streams);

    expect(cap.err()).not.toContain("protected");
  });

  it("counts protected keys as needing a human in a human-only project -> 3", async () => {
    const summary = makeSummary({
      locales: [makeLocale({ protected: [{ key: "greeting", reason: "import" }] })],
      succeeded: ["de"],
    });
    const { deps } = recordingDeps({ translate: async () => summary, loadConfig: humanOnlyConfig });
    const cap = captureStreams();

    expect(await run(["translate"], deps, cap.streams)).toBe(3);
    expect(cap.err()).toContain("1 key needs a human translation");
  });
});

describe("run check and diff: protected keys", () => {
  it("shows the protected share of the stale keys in check", async () => {
    const summary = makeCheckSummary({
      inSync: false,
      locales: [{ locale: "de", missing: 0, stale: 2, protected: 1, upToDate: 3, inSync: false }],
    });
    const { deps } = recordingDeps({ check: async () => summary });
    const cap = captureStreams();

    expect(await run(["check"], deps, cap.streams)).toBe(1);
    expect(cap.out()).toContain("de: 0 missing, 2 stale (1 protected), 3 up-to-date");
  });

  it("lists protected keys in diff", async () => {
    const { deps } = recordingDeps({
      diff: async () => ({
        hasPendingChanges: true,
        locales: [
          {
            locale: "de",
            missing: [],
            changed: ["greeting"],
            orphaned: [],
            hasPendingChanges: true,
            protected: ["greeting"],
          },
        ],
      }),
    });
    const cap = captureStreams();

    await run(["diff"], deps, cap.streams);

    expect(cap.out()).toMatch(/protected:\s+greeting/);
  });
});
