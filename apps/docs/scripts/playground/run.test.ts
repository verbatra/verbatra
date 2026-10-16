import { ProviderError } from "@verbatra/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaygroundRefusal } from "./guards.ts";
import { ATTEMPT_CAP } from "./limits.ts";
import { dryRun, refuseProvider, translateForWrite } from "./run.ts";
import { PLAYGROUND_LANGUAGES, PLAYGROUND_SOURCE } from "./source.ts";
import { stubbedRequest as request } from "./test-support.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("translateForWrite: incremental", () => {
  it("sends only the new and changed pairs and keeps the committed values", async () => {
    const first = request();
    const firstOutcome = await translateForWrite(first.runRequest);
    if (firstOutcome.kind !== "ready") {
      throw new Error(`expected ready, got ${firstOutcome.kind}`);
    }
    const items = PLAYGROUND_SOURCE.map((item) =>
      item.id === "save" ? { ...item, text: "Save all changes" } : item,
    );
    const second = request({}, { items, existing: firstOutcome.output });
    const outcome = await translateForWrite(second.runRequest);
    expect(outcome.kind).toBe("ready");
    const sentKeys = second.provider.sent.flatMap((sent) => sent.entries.map((entry) => entry.key));
    expect(sentKeys).toEqual(["save", "save", "save", "save"]);
  });

  it("reports nothing to do and sends nothing when every pair is committed", async () => {
    const first = request();
    const firstOutcome = await translateForWrite(first.runRequest);
    if (firstOutcome.kind !== "ready") {
      throw new Error(`expected ready, got ${firstOutcome.kind}`);
    }
    const second = request({}, { existing: firstOutcome.output });
    expect((await translateForWrite(second.runRequest)).kind).toBe("nothing-to-do");
    expect(second.provider.constructed()).toBe(0);
  });
});

describe("translateForWrite: budget", () => {
  it("aborts on the first provider retry with status 429 and returns nothing to write", async () => {
    const { provider, runRequest } = request({
      beforeReply: (hooks) => hooks?.onRetry?.({ attempt: 2, delayMs: 250, status: 429 }),
    });
    const outcome = await translateForWrite(runRequest);
    expect(outcome).toMatchObject({ kind: "stopped", reason: "rate-limited" });
    expect(provider.sent).toHaveLength(1);
  });

  it("does not abort on a provider retry with another status", async () => {
    const { runRequest } = request({
      beforeReply: (hooks, call) => {
        if (call === 1) {
          hooks?.onRetry?.({ attempt: 2, delayMs: 250, status: 503 });
        }
      },
    });
    expect((await translateForWrite(runRequest)).kind).toBe("ready");
  });

  it(`never sends more than ${ATTEMPT_CAP} attempts and stops at the cap`, async () => {
    const { provider, runRequest } = request({
      beforeReply: (hooks) => {
        for (let attempt = 2; attempt <= 7; attempt += 1) {
          hooks?.onRetry?.({ attempt, delayMs: 250, status: 503 });
        }
      },
    });
    const outcome = await translateForWrite(runRequest);
    expect(outcome).toMatchObject({ kind: "stopped", reason: "attempt-cap" });
    expect(provider.sent.length).toBeLessThanOrEqual(ATTEMPT_CAP);
  });

  it("stops before the request past a small cap is sent", async () => {
    const { provider, runRequest } = request({}, { attemptCap: 2 });
    const outcome = await translateForWrite(runRequest);
    expect(outcome).toMatchObject({ kind: "stopped", reason: "attempt-cap" });
    expect(provider.sent).toHaveLength(2);
  });
});

describe("translateForWrite: truncation splits", () => {
  const truncateMultiKeyBatches = (request: { entries: readonly unknown[] }) =>
    request.entries.length > 1
      ? new ProviderError("OUTPUT_TRUNCATED", "the reply was cut off")
      : undefined;

  it("counts every resent half and holds the cap at 20 attempts while splits recurse", async () => {
    const { provider, runRequest } = request({ failBatch: truncateMultiKeyBatches });
    const outcome = await translateForWrite(runRequest);
    expect(outcome).toMatchObject({ kind: "stopped", reason: "attempt-cap" });
    expect(provider.sent.length).toBeLessThanOrEqual(ATTEMPT_CAP);
    expect(provider.sent.length).toBeGreaterThan(PLAYGROUND_LANGUAGES.length);
  });

  it("completes when the recursive splits fit under the cap", async () => {
    const { provider, runRequest } = request(
      { failBatch: truncateMultiKeyBatches },
      { languages: ["de"], attemptCap: 19 },
    );
    const outcome = await translateForWrite(runRequest);
    expect(outcome.kind).toBe("ready");
    expect(provider.sent).toHaveLength(2 * PLAYGROUND_SOURCE.length - 1);
  });
});

describe("translateForWrite: provider failures", () => {
  it.each([
    ["AUTH_FAILED", "API key not valid"],
    ["PROVIDER_ERROR", "quota exceeded"],
    ["INVALID_REQUEST", "bad request"],
    ["PROVIDER_UNAVAILABLE", "service unavailable after retries"],
  ] as const)(
    "aborts the run on a non-429 failure (%s) and reports it as a provider failure",
    async (code, message) => {
      const { provider, runRequest } = request({
        failBatch: () => new ProviderError(code, message),
      });
      const outcome = await translateForWrite(runRequest);
      expect(outcome.kind).toBe("provider-failed");
      expect(provider.sent).toHaveLength(1);
      if (outcome.kind === "provider-failed") {
        expect(outcome.messages.join("\n")).toContain(code);
      }
    },
  );
});

describe("translateForWrite: output validation is all or nothing", () => {
  it("rejects the whole run when one value equals the source", async () => {
    const { runRequest } = request({
      transform: (value, locale) => (value === "Settings" ? value : `${locale}: ${value}`),
    });
    const outcome = await translateForWrite(runRequest);
    expect(outcome.kind).toBe("rejected");
  });

  it("rejects the whole run when one value drops a placeholder", async () => {
    const { runRequest } = request({
      transform: (value, locale) =>
        value.includes("{name}") ? "Willkommen" : `${locale}: ${value}`,
    });
    const outcome = await translateForWrite(runRequest);
    expect(outcome.kind).toBe("rejected");
  });

  it("rejects the whole run when one value carries markup", async () => {
    const { runRequest } = request({
      transform: (value, locale) => `<b>${locale}</b> ${value}`,
    });
    const outcome = await translateForWrite(runRequest);
    expect(outcome.kind).toBe("rejected");
  });

  it("lets a sameAllowed item stay identical to its source", async () => {
    const { runRequest } = request({
      transform: (value, locale) => (value === "Verbatra" ? value : `${locale}: ${value}`),
    });
    const outcome = await translateForWrite(runRequest);
    expect(outcome.kind).toBe("ready");
  });
});

describe("dryRun", () => {
  it("uses refuseProvider when no provider is injected: no fetch, no construction", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network is forbidden in a dry run");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { runRequest } = request();
    const { createProvider: _stub, ...withoutProvider } = runRequest;
    const report = await dryRun(withoutProvider);
    expect(report.sdkRequests).toBe(PLAYGROUND_LANGUAGES.length);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(() =>
      refuseProvider({ id: "gemini", options: { model: "m", maxOutputTokens: 1 } }),
    ).toThrow(PlaygroundRefusal);
  });

  it("plans every pair, constructs no provider and calls no fetch", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network is forbidden in a dry run");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { provider, runRequest } = request();
    const report = await dryRun(runRequest);
    expect(report.plan.pairs).toHaveLength(PLAYGROUND_SOURCE.length * PLAYGROUND_LANGUAGES.length);
    expect(report.plannedRequests).toBe(PLAYGROUND_LANGUAGES.length);
    expect(report.sdkRequests).toBe(PLAYGROUND_LANGUAGES.length);
    expect(provider.constructed()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
