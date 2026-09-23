import { describe, expect, it } from "vitest";
import type { JsonEnvelope } from "./harness.js";
import {
  classifyLiveRun,
  classifyRunEnvelope,
  type RunLocaleSummary,
  type RunSummary,
} from "./run-outcome.js";

const TARGET = { locale: "de", key: "welcome" } as const;

const REAL_RATE_LIMIT_NOTICE =
  "A sub-batch of 1 entries failed (RATE_LIMITED: The translation provider rate-limited this request.) and was withheld; it will be retried next run.";

function locale(overrides: Partial<RunLocaleSummary> = {}): RunLocaleSummary {
  return {
    locale: "de",
    translated: [],
    unchanged: [],
    providerFailures: [],
    integrityMismatches: [],
    budgetWithheld: [],
    notices: [],
    ...overrides,
  };
}

function record(...locales: RunLocaleSummary[]): JsonEnvelope<RunSummary> {
  return { ok: true, version: 1, command: "watch", result: { locales } };
}

describe("classifyRunEnvelope", () => {
  it("reports a translated key as delivered", () => {
    const outcome = classifyRunEnvelope(record(locale({ translated: ["welcome"] })), TARGET);
    expect(outcome.kind).toBe("delivered");
  });

  it("reports an already-current key as delivered, so a retry run counts the earlier success", () => {
    const outcome = classifyRunEnvelope(record(locale({ unchanged: ["welcome"] })), TARGET);
    expect(outcome.kind).toBe("delivered");
  });

  it("reports a cache hit and a generated plural form as delivered", () => {
    expect(classifyRunEnvelope(record(locale({ cacheHits: ["welcome"] })), TARGET).kind).toBe(
      "delivered",
    );
    expect(classifyRunEnvelope(record(locale({ generated: ["welcome"] })), TARGET).kind).toBe(
      "delivered",
    );
  });

  it("reads the real rate-limit notice as throttling, not as a product failure", () => {
    const outcome = classifyRunEnvelope(
      record(
        locale({
          providerFailures: ["welcome"],
          notices: [{ code: "SUB_BATCH_FAILED", message: REAL_RATE_LIMIT_NOTICE }],
        }),
      ),
      TARGET,
    );
    expect(outcome.kind).toBe("throttled");
  });

  it("reports a key withheld for any other provider reason as a failure", () => {
    const outcome = classifyRunEnvelope(
      record(
        locale({
          providerFailures: ["welcome"],
          notices: [
            {
              code: "SUB_BATCH_FAILED",
              message:
                "A sub-batch of 1 entries failed (AUTH_FAILED: The translation provider rejected the credentials.) and was withheld; it will be retried next run.",
            },
          ],
        }),
      ),
      TARGET,
    );
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.detail).toContain("AUTH_FAILED");
    }
  });

  it("reports a key withheld with no notice at all as a failure", () => {
    const outcome = classifyRunEnvelope(record(locale({ providerFailures: ["welcome"] })), TARGET);
    expect(outcome.kind).toBe("failed");
  });

  it("does not read a stray mention of the rate-limit code as throttling", () => {
    const outcome = classifyRunEnvelope(
      record(
        locale({
          providerFailures: ["welcome"],
          notices: [
            {
              code: "SUB_BATCH_FAILED",
              message:
                "A sub-batch of 1 entries failed (PROVIDER_ERROR: the response mentioned RATE_LIMITED handling) and was withheld; it will be retried next run.",
            },
          ],
        }),
      ),
      TARGET,
    );
    expect(outcome.kind).toBe("failed");
  });

  it("reports a placeholder-integrity withholding as a failure", () => {
    const outcome = classifyRunEnvelope(
      record(locale({ integrityMismatches: ["welcome"] })),
      TARGET,
    );
    expect(outcome.kind).toBe("failed");
  });

  it("reports a budget withholding as a failure", () => {
    const outcome = classifyRunEnvelope(record(locale({ budgetWithheld: ["welcome"] })), TARGET);
    expect(outcome.kind).toBe("failed");
  });

  it("reports a failed run record as a failure", () => {
    const outcome = classifyRunEnvelope(
      { ok: false, version: 1, command: "watch", code: "WATCH_RUN_FAILED", message: "boom" },
      TARGET,
    );
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.detail).toContain("WATCH_RUN_FAILED");
    }
  });

  it("reports a locale that threw on a rate limit as throttling", () => {
    const outcome = classifyRunEnvelope(
      record(locale({ error: { code: "RATE_LIMITED", message: "rate limited" } })),
      TARGET,
    );
    expect(outcome.kind).toBe("throttled");
  });

  it("reports a locale that threw for any other reason as a failure", () => {
    const outcome = classifyRunEnvelope(
      record(locale({ error: { code: "SOURCE_UNREADABLE", message: "missing" } })),
      TARGET,
    );
    expect(outcome.kind).toBe("failed");
  });

  it("reports a missing summary for the awaited locale as a failure", () => {
    const outcome = classifyRunEnvelope(record(locale({ locale: "fr" })), TARGET);
    expect(outcome.kind).toBe("failed");
  });

  it("reports a run that has not reached the key yet as pending", () => {
    const outcome = classifyRunEnvelope(record(locale({ unchanged: ["greeting"] })), TARGET);
    expect(outcome.kind).toBe("pending");
  });
});

const LIVE_TARGET = { locale: "de", key: "farewell" } as const;

function stdoutOf(...locales: RunLocaleSummary[]): string {
  return `${JSON.stringify({
    ok: true,
    version: 1,
    command: "translate",
    result: { succeeded: [], partial: [], failed: ["de"], locales },
  })}\n`;
}

const RATE_LIMITED_LOCALE = locale({
  status: "failed",
  providerFailures: ["farewell"],
  translated: ["greeting"],
  notices: [{ code: "SUB_BATCH_FAILED", message: REAL_RATE_LIMIT_NOTICE }],
});

describe("classifyLiveRun", () => {
  it("calls exit 0 clean without reading stdout, because a clean run needs no excuse", () => {
    expect(classifyLiveRun({ exitCode: 0, stdout: "" }, LIVE_TARGET).kind).toBe("clean");
  });

  it("skips the exact rate-limited run that turned the live workflow red on commit cecf00a", () => {
    const verdict = classifyLiveRun(
      { exitCode: 1, stdout: stdoutOf(RATE_LIMITED_LOCALE) },
      LIVE_TARGET,
    );
    expect(verdict.kind).toBe("throttled");
    if (verdict.kind === "throttled") {
      expect(verdict.detail).toContain("RATE_LIMITED");
    }
  });

  it("skips a partial locale that exits 1 only because of throttling, the surface b5e7bc2 opened", () => {
    const verdict = classifyLiveRun(
      {
        exitCode: 1,
        stdout: stdoutOf({ ...RATE_LIMITED_LOCALE, status: "partial" }),
      },
      LIVE_TARGET,
    );
    expect(verdict.kind).toBe("throttled");
  });

  it("fails a genuine provider failure that is not a rate limit", () => {
    const verdict = classifyLiveRun(
      {
        exitCode: 1,
        stdout: stdoutOf(
          locale({
            status: "failed",
            providerFailures: ["farewell"],
            notices: [
              {
                code: "SUB_BATCH_FAILED",
                message:
                  "A sub-batch of 1 entries failed (PROVIDER_REFUSED: The translation provider refused the request.) and was withheld; it will be retried next run.",
              },
            ],
          }),
        ),
      },
      LIVE_TARGET,
    );
    expect(verdict.kind).toBe("failed");
    if (verdict.kind === "failed") {
      expect(verdict.detail).toContain("PROVIDER_REFUSED");
    }
  });

  it("fails an integrity rejection on the awaited key", () => {
    const verdict = classifyLiveRun(
      {
        exitCode: 1,
        stdout: stdoutOf(locale({ status: "failed", integrityMismatches: ["farewell"] })),
      },
      LIVE_TARGET,
    );
    expect(verdict.kind).toBe("failed");
  });

  it("fails a throttled run that also rejected another key on integrity, so a real regression cannot hide behind a rate limit", () => {
    const verdict = classifyLiveRun(
      {
        exitCode: 1,
        stdout: stdoutOf({ ...RATE_LIMITED_LOCALE, integrityMismatches: ["greeting"] }),
      },
      LIVE_TARGET,
    );
    expect(verdict.kind).toBe("failed");
    if (verdict.kind === "failed") {
      expect(verdict.detail).toContain("placeholder-integrity");
    }
  });

  it("fails a throttled run that also withheld another key on budget", () => {
    const verdict = classifyLiveRun(
      {
        exitCode: 1,
        stdout: stdoutOf({ ...RATE_LIMITED_LOCALE, budgetWithheld: ["greeting"] }),
      },
      LIVE_TARGET,
    );
    expect(verdict.kind).toBe("failed");
  });

  it("fails exit 2, because a usage or config error is never throttling", () => {
    const verdict = classifyLiveRun(
      { exitCode: 2, stdout: stdoutOf(RATE_LIMITED_LOCALE) },
      LIVE_TARGET,
    );
    expect(verdict.kind).toBe("failed");
  });

  it("fails a run killed by a signal, where exitCode is null", () => {
    expect(classifyLiveRun({ exitCode: null, stdout: "" }, LIVE_TARGET).kind).toBe("failed");
  });

  it("fails exit 1 with no readable --json record instead of guessing throttling", () => {
    expect(classifyLiveRun({ exitCode: 1, stdout: "not json at all" }, LIVE_TARGET).kind).toBe(
      "failed",
    );
  });

  it("fails exit 1 whose envelope reports the awaited key as delivered, since something else broke", () => {
    const verdict = classifyLiveRun(
      { exitCode: 1, stdout: stdoutOf(locale({ translated: ["farewell"] })) },
      LIVE_TARGET,
    );
    expect(verdict.kind).toBe("failed");
  });

  it("fails an error envelope on exit 1", () => {
    const verdict = classifyLiveRun(
      {
        exitCode: 1,
        stdout: `${JSON.stringify({ ok: false, version: 1, command: "translate", code: "CONFIG_INVALID", message: "bad" })}\n`,
      },
      LIVE_TARGET,
    );
    expect(verdict.kind).toBe("failed");
    if (verdict.kind === "failed") {
      expect(verdict.detail).toContain("CONFIG_INVALID");
    }
  });

  it("fails a locale-level throw that is not a rate limit", () => {
    const verdict = classifyLiveRun(
      {
        exitCode: 1,
        stdout: stdoutOf(
          locale({ status: "failed", error: { code: "AUTH_FAILED", message: "rejected" } }),
        ),
      },
      LIVE_TARGET,
    );
    expect(verdict.kind).toBe("failed");
  });

  it("skips a locale-level throw that is a rate limit", () => {
    const verdict = classifyLiveRun(
      {
        exitCode: 1,
        stdout: stdoutOf(
          locale({ status: "failed", error: { code: "RATE_LIMITED", message: "rate limited" } }),
        ),
      },
      LIVE_TARGET,
    );
    expect(verdict.kind).toBe("throttled");
  });
});

const TRANSIENT_CODES = ["RATE_LIMITED", "PROVIDER_UNAVAILABLE", "TIMEOUT"] as const;

function subBatchNotice(code: string, message = "The translation provider failed.") {
  return {
    code: "SUB_BATCH_FAILED",
    message: `A sub-batch of 1 entries failed (${code}: ${message}) and was withheld; it will be retried next run.`,
  };
}

describe("classifyRunEnvelope: transient provider faults", () => {
  it.each(TRANSIENT_CODES)(
    "reads a sub-batch withheld on %s as throttled, naming the code",
    (code) => {
      const outcome = classifyRunEnvelope(
        record(locale({ providerFailures: ["welcome"], notices: [subBatchNotice(code)] })),
        TARGET,
      );
      expect(outcome).toMatchObject({ kind: "throttled", detail: expect.stringContaining(code) });
    },
  );

  it.each(TRANSIENT_CODES)("reads a locale that threw %s as throttled, naming the code", (code) => {
    const outcome = classifyRunEnvelope(
      record(locale({ error: { code, message: "transient" } })),
      TARGET,
    );
    expect(outcome).toMatchObject({ kind: "throttled", detail: expect.stringContaining(code) });
  });

  it.each(["PROVIDER_ERROR", "AUTH_FAILED", "INVALID_RESPONSE", "PROVIDER_CALL_FAILED"])(
    "still fails a sub-batch withheld on %s, which is outside the transient set",
    (code) => {
      const outcome = classifyRunEnvelope(
        record(locale({ providerFailures: ["welcome"], notices: [subBatchNotice(code)] })),
        TARGET,
      );
      expect(outcome).toMatchObject({ kind: "failed", detail: expect.stringContaining(code) });
    },
  );

  it.each(["PROVIDER_ERROR", "AUTH_FAILED", "INVALID_RESPONSE"])(
    "still fails a locale that threw %s, which is outside the transient set",
    (code) => {
      const outcome = classifyRunEnvelope(
        record(locale({ error: { code, message: "broken" } })),
        TARGET,
      );
      expect(outcome).toMatchObject({ kind: "failed", detail: expect.stringContaining(code) });
    },
  );

  it("fails when a transient sub-batch failure sits beside a genuine one in the same locale", () => {
    const outcome = classifyRunEnvelope(
      record(
        locale({
          providerFailures: ["welcome"],
          notices: [subBatchNotice("PROVIDER_UNAVAILABLE"), subBatchNotice("AUTH_FAILED")],
        }),
      ),
      TARGET,
    );
    expect(outcome).toMatchObject({
      kind: "failed",
      detail: expect.stringContaining("AUTH_FAILED"),
    });
  });

  it("reads only the code the sdk stamped, not a transient code quoted inside the provider message", () => {
    const outcome = classifyRunEnvelope(
      record(
        locale({
          providerFailures: ["welcome"],
          notices: [subBatchNotice("PROVIDER_ERROR", "upstream said (TIMEOUT: retry later)")],
        }),
      ),
      TARGET,
    );
    expect(outcome.kind).toBe("failed");
  });

  it("fails a throttled watch run that also rejected another key on integrity", () => {
    const outcome = classifyRunEnvelope(
      record(
        locale({
          providerFailures: ["welcome"],
          integrityMismatches: ["greeting"],
          notices: [subBatchNotice("TIMEOUT")],
        }),
      ),
      TARGET,
    );
    expect(outcome).toMatchObject({
      kind: "failed",
      detail: expect.stringContaining("placeholder-integrity"),
    });
  });

  it("fails a locale that threw a transient code while also withholding keys on budget", () => {
    const outcome = classifyRunEnvelope(
      record(
        locale({
          error: { code: "PROVIDER_UNAVAILABLE", message: "down" },
          budgetWithheld: ["greeting"],
        }),
      ),
      TARGET,
    );
    expect(outcome).toMatchObject({
      kind: "failed",
      detail: expect.stringContaining("token budget"),
    });
  });
});

describe("classifyLiveRun: transient provider faults", () => {
  it.each(TRANSIENT_CODES)("skips a translate run whose only failure is %s", (code) => {
    const verdict = classifyLiveRun(
      {
        exitCode: 1,
        stdout: stdoutOf(
          locale({
            status: "failed",
            providerFailures: ["farewell"],
            notices: [subBatchNotice(code)],
          }),
        ),
      },
      LIVE_TARGET,
    );
    expect(verdict).toMatchObject({ kind: "throttled", detail: expect.stringContaining(code) });
  });

  it("skips the exact outage that turned the live workflow red, a watch sub-batch on PROVIDER_UNAVAILABLE", () => {
    const verdict = classifyLiveRun(
      {
        exitCode: 1,
        stdout: stdoutOf(
          locale({
            status: "partial",
            translated: ["greeting"],
            providerFailures: ["farewell"],
            notices: [
              subBatchNotice(
                "PROVIDER_UNAVAILABLE",
                "The translation provider is temporarily unavailable.",
              ),
            ],
          }),
        ),
      },
      LIVE_TARGET,
    );
    expect(verdict.kind).toBe("throttled");
  });

  it("fails a run that mixes an outage with a genuine provider failure", () => {
    const verdict = classifyLiveRun(
      {
        exitCode: 1,
        stdout: stdoutOf(
          locale({
            status: "failed",
            providerFailures: ["farewell"],
            notices: [subBatchNotice("TIMEOUT"), subBatchNotice("PROVIDER_REFUSED")],
          }),
        ),
      },
      LIVE_TARGET,
    );
    expect(verdict).toMatchObject({
      kind: "failed",
      detail: expect.stringContaining("PROVIDER_REFUSED"),
    });
  });
});
