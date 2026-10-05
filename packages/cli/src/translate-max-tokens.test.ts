import { SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import {
  captureStreams,
  makeLocale,
  makeSummary,
  parseEnvelope,
  recordingDeps,
} from "./test-support.js";

describe("run translate: --max-tokens", () => {
  it("passes a valid --max-tokens to the SDK translate() as a number", async () => {
    const { deps, calls } = recordingDeps();

    const code = await run(["translate", "--max-tokens", "50000"], deps, captureStreams().streams);

    expect(code).toBe(0);
    expect(calls.translate[0]?.maxTokens).toBe(50000);
  });

  it("omitting --max-tokens leaves it unset, so the config budget alone applies", async () => {
    const { deps, calls } = recordingDeps();

    await run(["translate"], deps, captureStreams().streams);

    expect(calls.translate[0]).not.toHaveProperty("maxTokens");
  });

  it.each(["abc", "0", "-2", "2.5", "10k", "9007199254740992"])(
    "rejects an invalid --max-tokens %s as a usage error: exit 2, structured stderr, no SDK call",
    async (value) => {
      const { deps, calls } = recordingDeps();
      const cap = captureStreams();

      const code = await run(["translate", "--max-tokens", value], deps, cap.streams);

      expect(code).toBe(2);
      expect(cap.err()).toContain("[INVALID_MAX_TOKENS]");
      expect(cap.out()).toBe("");
      expect(calls.translate).toHaveLength(0);
    },
  );

  it("exits 1 when the ceiling withheld work, as a configured stop budget does", async () => {
    const summary = makeSummary({
      locales: [
        makeLocale({ status: "partial", translated: ["greeting"], budgetWithheld: ["farewell"] }),
      ],
      partial: ["de"],
      budget: { maxTokens: 100, behavior: "stop", supported: true, tokensUsed: 90, exceeded: true },
    });
    const { deps } = recordingDeps({ translate: async () => summary });
    const cap = captureStreams();

    const code = await run(["translate", "--max-tokens", "100", "--json"], deps, cap.streams);

    expect(code).toBe(1);
    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: true,
      command: "translate",
      result: { budget: { maxTokens: 100, behavior: "stop", exceeded: true } },
    });
  });

  it("reports an SDK refusal of the ceiling and concurrency together as exit 2", async () => {
    const { deps } = recordingDeps({
      translate: () =>
        Promise.reject(
          new SdkError("CONCURRENCY_BUDGET_CONFLICT", "budget and concurrency cannot combine"),
        ),
    });
    const cap = captureStreams();

    const code = await run(
      ["translate", "--max-tokens", "100", "--concurrency", "2"],
      deps,
      cap.streams,
    );

    expect(code).toBe(2);
    expect(cap.err()).toContain("[CONCURRENCY_BUDGET_CONFLICT]");
  });
});
