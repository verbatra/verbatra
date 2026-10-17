import { afterEach, describe, expect, it } from "vitest";
import {
  collectFailureReport,
  formatRecordedOutput,
  isSecretEnvName,
  recordPendingRun,
  recordRun,
  redactSecrets,
  resetRecordedRuns,
} from "./diagnostics.js";
import { PROVIDER_ENV_VARS } from "./harness.js";

const SK_PROJ = ["sk", "proj", ""].join("-");

const SECRET = "super-secret-value-1234";

const MIN_VISIBLE_PREFIX = 12;

afterEach(() => {
  delete process.env.E2E_FAKE_API_KEY;
  delete process.env.E2E_FAKE_FLAG;
  resetRecordedRuns();
});

describe("redactSecrets", () => {
  it("replaces the value of a credential-shaped environment variable", () => {
    process.env.E2E_FAKE_API_KEY = SECRET;

    const redacted = redactSecrets(`verbatra: error [AUTH] key ${SECRET} was rejected`);

    expect(redacted).not.toContain(SECRET);
    expect(redacted).toContain("[redacted]");
    expect(redacted).toContain("verbatra: error [AUTH]");
  });

  it("leaves the value of a variable that is not credential-shaped alone", () => {
    process.env.E2E_FAKE_FLAG = "not-a-secret-value";

    expect(redactSecrets("saw not-a-secret-value")).toBe("saw not-a-secret-value");
  });

  it("ignores short values so an empty or trivial variable cannot corrupt the report", () => {
    process.env.E2E_FAKE_API_KEY = "";

    expect(redactSecrets("abc")).toBe("abc");

    process.env.E2E_FAKE_API_KEY = "true";

    expect(redactSecrets("true story")).toBe("true story");
  });

  it("redacts key-shaped tokens that never passed through this process environment", () => {
    const gemini = "AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7";
    const openai = `${SK_PROJ}abcdefghijklmnopqrstuvwxyz0123456789`;

    expect(redactSecrets(`${gemini} and ${openai}`)).toBe("[redacted] and [redacted]");
  });

  it("covers every provider key variable the harness reads", () => {
    for (const name of Object.values(PROVIDER_ENV_VARS)) {
      expect(isSecretEnvName(name)).toBe(true);
    }
  });
});

describe("formatRecordedOutput", () => {
  it("labels both streams and reports the exit code and signal", () => {
    const block = formatRecordedOutput("verbatra translate --json", {
      exitCode: 1,
      signal: null,
      stdout: "some progress",
      stderr: "verbatra: error [PROVIDER_AUTH] invalid key",
    });

    expect(block).toContain("verbatra translate --json (exit 1, signal null)");
    expect(block).toContain("some progress");
    expect(block).toContain("verbatra: error [PROVIDER_AUTH] invalid key");
  });

  it("marks an empty stream instead of printing nothing", () => {
    const block = formatRecordedOutput("verbatra check", {
      exitCode: 0,
      signal: null,
      stdout: "",
      stderr: "",
    });

    expect(block.match(/<empty>/g)).toHaveLength(2);
  });

  it("keeps the tail of an oversized stream and says how much was dropped", () => {
    const block = formatRecordedOutput("verbatra translate", {
      exitCode: 1,
      signal: null,
      stdout: `${"x".repeat(5000)}THE-END`,
      stderr: "",
    });

    expect(block).toContain("THE-END");
    expect(block).toContain("earlier characters omitted");
  });

  it("redacts before truncating, so a key at the cut point cannot leak a prefix", () => {
    process.env.E2E_FAKE_API_KEY = SECRET;
    const noise = "x".repeat(4000);

    const block = formatRecordedOutput("verbatra translate", {
      exitCode: 1,
      signal: null,
      stdout: `${noise}${SECRET}${noise}`,
      stderr: "",
    });

    expect(block).not.toContain(SECRET.slice(0, MIN_VISIBLE_PREFIX));
  });
});

describe("collectFailureReport", () => {
  it("returns nothing when no run was recorded", async () => {
    expect(await collectFailureReport()).toEqual([]);
  });

  it("reports completed and pending runs in the order they started", async () => {
    recordRun("verbatra check", { exitCode: 2, signal: null, stdout: "", stderr: "boom" });
    recordPendingRun("verbatra watch", async () => ({
      exitCode: 0,
      signal: null,
      stdout: "watching",
      stderr: "",
    }));

    const blocks = await collectFailureReport();

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("verbatra check");
    expect(blocks[0]).toContain("boom");
    expect(blocks[1]).toContain("watching");
  });

  it("reports a run whose output cannot be resolved instead of throwing", async () => {
    recordPendingRun("verbatra watch", () => Promise.reject(new Error("gone")));

    const blocks = await collectFailureReport();

    expect(blocks).toEqual(["--- e2e captured output: verbatra watch (no output available)"]);
  });

  it("forgets recorded runs on reset", async () => {
    recordRun("verbatra check", { exitCode: 0, signal: null, stdout: "", stderr: "" });
    resetRecordedRuns();

    expect(await collectFailureReport()).toEqual([]);
  });
});
