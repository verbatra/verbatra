import type { WatchRunResult } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  JSON_ENVELOPE_VERSION,
  renderErrorEnvelope,
  renderRunResultEnvelope,
  renderSuccessEnvelope,
} from "./json-envelope.js";
import { makeLocale, makeSummary, parseEnvelope } from "./test-support.js";

describe("json-envelope: success", () => {
  it("wraps the payload under result with the ok, version, and command fields", () => {
    const summary = makeSummary({ succeeded: ["de"] });

    const parsed = parseEnvelope(renderSuccessEnvelope("translate", summary));

    expect(parsed.ok).toBe(true);
    expect(parsed.version).toBe(JSON_ENVELOPE_VERSION);
    expect(parsed.command).toBe("translate");
    expect(parsed.result).toEqual(summary);
  });

  it("nests rather than spreads, so a payload field can never collide with an envelope field", () => {
    const parsed = parseEnvelope(renderSuccessEnvelope("check", { ok: "payload-field" }));

    expect(parsed.ok).toBe(true);
    expect(parsed.result).toEqual({ ok: "payload-field" });
  });

  it("names the command it was given, so a consumer never has to infer it", () => {
    for (const command of ["translate", "import", "check", "diff", "export"]) {
      expect(parseEnvelope(renderSuccessEnvelope(command, {})).command).toBe(command);
    }
  });
});

describe("json-envelope: failure", () => {
  it("carries ok false with the stable code and message", () => {
    const parsed = parseEnvelope(
      renderErrorEnvelope("translate", { code: "CONFIG_INVALID", message: "bad config" }),
    );

    expect(parsed.ok).toBe(false);
    expect(parsed.version).toBe(JSON_ENVELOPE_VERSION);
    expect(parsed.command).toBe("translate");
    expect(parsed.code).toBe("CONFIG_INVALID");
    expect(parsed.message).toBe("bad config");
  });

  it("carries the wrapped cause's code only when there is one", () => {
    const withCause = parseEnvelope(
      renderErrorEnvelope("translate", {
        code: "PROVIDER_CONSTRUCTION_FAILED",
        message: "m",
        causeCode: "MISSING_API_KEY",
      }),
    );
    const without = parseEnvelope(renderErrorEnvelope("translate", { code: "X", message: "m" }));

    expect(withCause).toMatchObject({
      code: "PROVIDER_CONSTRUCTION_FAILED",
      causeCode: "MISSING_API_KEY",
    });
    expect(without).not.toHaveProperty("causeCode");
  });

  it("carries a null command when no subcommand was resolved", () => {
    const parsed = parseEnvelope(renderErrorEnvelope(null, { code: "CLI_ERROR", message: "x" }));

    expect(parsed.command).toBeNull();
    expect(parsed.ok).toBe(false);
  });

  it("keeps a message with newlines on one line, so one record stays one line", () => {
    const line = renderErrorEnvelope("check", {
      code: "SOURCE_INVALID",
      message: "first line\nsecond line",
    });

    expect(line).not.toContain("\n");
    expect(parseEnvelope(line).message).toBe("first line\nsecond line");
  });
});

describe("json-envelope: watch NDJSON records", () => {
  it("renders a succeeded run as the same success envelope translate emits", () => {
    const result: WatchRunResult = {
      status: "succeeded",
      summary: makeSummary({
        locales: [makeLocale({ orphaned: ["x"], pruned: ["x"] })],
        succeeded: ["de"],
      }),
    };

    const parsed = parseEnvelope(renderRunResultEnvelope(result));

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("watch");
    expect(parsed.result).toEqual(result.summary);
  });

  it("renders a failed run as an error envelope carrying that run's code and message", () => {
    const result: WatchRunResult = {
      status: "failed",
      error: { code: "SOURCE_INVALID", message: "x" },
    };

    const parsed = parseEnvelope(renderRunResultEnvelope(result));

    expect(parsed.ok).toBe(false);
    expect(parsed.command).toBe("watch");
    expect(parsed.code).toBe("SOURCE_INVALID");
    expect(parsed.message).toBe("x");
  });

  it("emits no embedded newline, so each run is exactly one NDJSON line", () => {
    const result: WatchRunResult = {
      status: "succeeded",
      summary: makeSummary({ succeeded: ["de"] }),
    };

    expect(renderRunResultEnvelope(result)).not.toContain("\n");
  });
});
