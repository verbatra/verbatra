import { declareProviderKeyEnvVar, SdkError } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "./run.js";
import { captureStreams, makeExportResult, parseEnvelope, recordingDeps } from "./test-support.js";

const BUILT_IN_KEY = "fake-openai-key-value-0123456789";
const CUSTOM_ENV_VAR = "ACME_TRANSLATE_TOKEN";
const CUSTOM_KEY = "acme-custom-secret-9876543210";
const REDACTED = "[REDACTED]";

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", BUILT_IN_KEY);
  vi.stubEnv(CUSTOM_ENV_VAR, CUSTOM_KEY);
  declareProviderKeyEnvVar({
    id: "openai-compatible",
    options: {
      baseUrl: "http://localhost:11434/v1",
      model: "local-model",
      maxOutputTokens: 256,
      apiKeyEnvVar: CUSTOM_ENV_VAR,
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function expectNoKey(text: string): void {
  expect(text).not.toContain(BUILT_IN_KEY);
  expect(text).not.toContain(CUSTOM_KEY);
}

const leakingFailure = (): SdkError =>
  new SdkError(
    "EXPORT_UNWRITABLE",
    `Could not write ${BUILT_IN_KEY}/handoff.xlsx for ${CUSTOM_KEY} (EACCES).`,
  );

describe("run: output redaction on the error path", () => {
  it("scrubs a built-in and a declared custom key value from the human error line", async () => {
    const { deps } = recordingDeps({
      exportWorkbook: async () => {
        throw leakingFailure();
      },
    });
    const cap = captureStreams();

    expect(await run(["export"], deps, cap.streams)).toBe(2);

    expectNoKey(cap.err());
    expect(cap.err()).toContain(
      `Could not write ${REDACTED}/handoff.xlsx for ${REDACTED} (EACCES).`,
    );
    expect(cap.out()).toBe("");
  });

  it("scrubs both values from the --json failure envelope and keeps it valid JSON", async () => {
    const { deps } = recordingDeps({
      exportWorkbook: async () => {
        throw leakingFailure();
      },
    });
    const cap = captureStreams();

    expect(await run(["export", "--json"], deps, cap.streams)).toBe(2);

    expectNoKey(cap.out());
    expectNoKey(cap.err());
    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: false,
      command: "export",
      code: "EXPORT_UNWRITABLE",
      message: `Could not write ${REDACTED}/handoff.xlsx for ${REDACTED} (EACCES).`,
    });
  });

  it("scrubs a key shape nobody configured, as the provider error scrub would", async () => {
    const { deps } = recordingDeps({
      loadConfig: async () => {
        throw new SdkError(
          "CONFIG_INVALID",
          "apiKey sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z is not allowed here",
        );
      },
    });
    const cap = captureStreams();

    await run(["check"], deps, cap.streams);

    expect(cap.err()).toContain(`apiKey ${REDACTED} is not allowed here`);
  });

  it("scrubs a DeepL Pro key in a key context from the --json failure envelope", async () => {
    const deeplKey = "12345678-1234-1234-1234-123456789012";
    const { deps } = recordingDeps({
      exportWorkbook: async () => {
        throw new SdkError(
          "EXPORT_UNWRITABLE",
          `Upstream rejected {"auth_key": "${deeplKey}"} with 403.`,
        );
      },
    });
    const cap = captureStreams();

    expect(await run(["export", "--json"], deps, cap.streams)).toBe(2);

    expect(cap.out()).not.toContain(deeplKey);
    expect(cap.err()).not.toContain(deeplKey);
    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: false,
      code: "EXPORT_UNWRITABLE",
      message: `Upstream rejected {"auth_key": "${REDACTED}"} with 403.`,
    });
  });

  it("keeps the --json envelope valid JSON when a key value holds a quote", async () => {
    const quotedKey = 'fake-quoted-key"';
    vi.stubEnv("OPENAI_API_KEY", quotedKey);
    const { deps } = recordingDeps({
      exportWorkbook: async () => {
        throw new SdkError("EXPORT_UNWRITABLE", `Could not write "${quotedKey}".`);
      },
    });
    const cap = captureStreams();

    expect(await run(["export", "--json"], deps, cap.streams)).toBe(2);

    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: false,
      message: `Could not write "${REDACTED}".`,
    });
  });

  it("scrubs a usage error that echoes a key value back from the command line", async () => {
    const cap = captureStreams();

    expect(await run(["export", `--${CUSTOM_KEY}`], recordingDeps().deps, cap.streams)).toBe(2);

    expectNoKey(cap.err());
    expect(cap.err()).toContain(REDACTED);
  });
});

describe("run: output redaction on the success path", () => {
  it("scrubs both values from the human summary", async () => {
    const { deps } = recordingDeps({
      exportWorkbook: async () =>
        makeExportResult({ path: `/proj/${BUILT_IN_KEY}/${CUSTOM_KEY}.xlsx` }),
    });
    const cap = captureStreams();

    expect(await run(["export"], deps, cap.streams)).toBe(0);

    expectNoKey(cap.out());
    expect(cap.out()).toContain(`verbatra export -> /proj/${REDACTED}/${REDACTED}.xlsx`);
  });

  it("scrubs both values from the --json success envelope and keeps it valid JSON", async () => {
    const { deps } = recordingDeps({
      exportWorkbook: async () =>
        makeExportResult({
          path: `/proj/${CUSTOM_KEY}/${BUILT_IN_KEY}.xlsx`,
          locales: [{ locale: "de", rows: 1 }],
        }),
    });
    const cap = captureStreams();

    await run(["export", "--json"], deps, cap.streams);

    expectNoKey(cap.out());
    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: true,
      command: "export",
      result: { path: `/proj/${REDACTED}/${REDACTED}.xlsx`, locales: [{ locale: "de", rows: 1 }] },
    });
  });
});

describe("run: redaction leaves no double-redaction artifacts", () => {
  it("passes text a provider error already scrubbed through unchanged", async () => {
    const message = `Provider rejected the key ${REDACTED} (401).`;
    const { deps } = recordingDeps({
      exportWorkbook: async () => {
        throw new SdkError("PROVIDER_CONSTRUCTION_FAILED", message);
      },
    });
    const cap = captureStreams();

    await run(["export", "--json"], deps, cap.streams);

    expect(parseEnvelope(cap.out())).toMatchObject({ message });
    expect(cap.err()).toContain(message);
    expect(occurrences(cap.err(), REDACTED)).toBe(1);
    expect(cap.err()).not.toContain("[[REDACTED]");
  });

  it("replaces each leaked value exactly once", async () => {
    const { deps } = recordingDeps({
      exportWorkbook: async () => {
        throw leakingFailure();
      },
    });
    const cap = captureStreams();

    await run(["export"], deps, cap.streams);

    expect(occurrences(cap.err(), REDACTED)).toBe(2);
  });
});
