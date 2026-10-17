import type { CheckReviewSummary, CheckSummary } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import { captureStreams, makeCheckSummary, parseEnvelope, recordingDeps } from "./test-support.js";

function reviewSummary(
  review: CheckReviewSummary,
  unreviewed: readonly string[],
  inSync = true,
): CheckSummary {
  return makeCheckSummary({
    inSync,
    locales: [
      { locale: "de", missing: 0, stale: 0, upToDate: 3, inSync, review: { unreviewed } },
      { locale: "fr", missing: 0, stale: 0, upToDate: 3, inSync, review: { unreviewed: [] } },
    ],
    review,
  });
}

const PASSED = reviewSummary({ reviewed: true, unreviewed: 0 }, []);
const FAILED = reviewSummary({ reviewed: false, unreviewed: 2, code: "REVIEW_REQUIRED" }, [
  "greeting",
  "title",
]);
const UNREADABLE = reviewSummary(
  { reviewed: false, unreviewed: 0, code: "REVIEW_STATE_UNREADABLE" },
  [],
);

describe("run check --require-reviewed", () => {
  it("passes requireReviewed to the SDK, and leaves it out without the flag", async () => {
    const { deps, calls } = recordingDeps({ check: async () => PASSED });

    await run(["check", "--require-reviewed", "--locales", "de"], deps, captureStreams().streams);
    await run(["check"], deps, captureStreams().streams);

    expect(calls.check[0]).toMatchObject({ requireReviewed: true, locales: ["de"] });
    expect(calls.check[1]).not.toHaveProperty("requireReviewed");
  });

  it("exits 0 when every machine-written translation is approved", async () => {
    const { deps } = recordingDeps({ check: async () => PASSED });
    const cap = captureStreams();

    expect(await run(["check", "--require-reviewed"], deps, cap.streams)).toBe(0);
    expect(cap.out()).toContain("review: every machine-written translation is approved");
  });

  it("exits 1 and names the unreviewed keys when the gate fails, even in sync", async () => {
    const { deps } = recordingDeps({ check: async () => FAILED });
    const cap = captureStreams();

    expect(await run(["check", "--require-reviewed"], deps, cap.streams)).toBe(1);
    expect(cap.out()).toContain(
      "review: failed [REVIEW_REQUIRED] 2 machine-written translations not approved",
    );
    expect(cap.out()).toContain("  de: 2 unreviewed: greeting, title");
    expect(cap.out()).not.toContain("fr: 0 unreviewed");
    expect(cap.out()).toContain("commit verbatra.provenance.json");
  });

  it("lists at most ten keys per locale and counts the rest", async () => {
    const keys = Array.from({ length: 12 }, (_, index) => `k${index}`);
    const summary = reviewSummary(
      { reviewed: false, unreviewed: 12, code: "REVIEW_REQUIRED" },
      keys,
    );
    const { deps } = recordingDeps({ check: async () => summary });
    const cap = captureStreams();

    await run(["check", "--require-reviewed"], deps, cap.streams);

    expect(cap.out()).toContain(
      "  de: 12 unreviewed: k0, k1, k2, k3, k4, k5, k6, k7, k8, k9, and 2 more",
    );
  });

  it("exits 1 with REVIEW_STATE_UNREADABLE when the provenance file cannot be read", async () => {
    const { deps } = recordingDeps({ check: async () => UNREADABLE });
    const cap = captureStreams();

    expect(await run(["check", "--require-reviewed"], deps, cap.streams)).toBe(1);
    expect(cap.out()).toContain("review: failed [REVIEW_STATE_UNREADABLE]");
  });

  it("carries the stable code in the JSON envelope", async () => {
    const { deps } = recordingDeps({ check: async () => FAILED });
    const cap = captureStreams();

    expect(await run(["check", "--require-reviewed", "--json"], deps, cap.streams)).toBe(1);
    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: true,
      command: "check",
      result: { review: { reviewed: false, unreviewed: 2, code: "REVIEW_REQUIRED" } },
    });
  });

  it("neutralizes control characters in the listed keys", async () => {
    const summary = reviewSummary({ reviewed: false, unreviewed: 1, code: "REVIEW_REQUIRED" }, [
      "a\u001b[31m",
    ]);
    const { deps } = recordingDeps({ check: async () => summary });
    const cap = captureStreams();

    await run(["check", "--require-reviewed"], deps, cap.streams);

    expect(cap.out()).not.toContain("\u001b");
  });
});
