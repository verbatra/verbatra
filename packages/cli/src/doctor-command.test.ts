import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DoctorResult, doctor } from "@verbatra/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JSON_ENVELOPE_VERSION } from "./json-envelope.js";
import { run } from "./run.js";
import { captureStreams, makeDoctorResult, parseEnvelope, recordingDeps } from "./test-support.js";

const KEY_CANARY = "sk-ant-cli-canary-4a7e2f9b1c6d";

function failingReport(): DoctorResult {
  return makeDoctorResult({
    ok: false,
    checks: [
      {
        id: "config",
        title: "Configuration",
        status: "pass",
        detail: "Loaded /proj/.verbatrarc.json.",
      },
      {
        id: "format-adapter",
        title: "Format adapter",
        status: "pass",
        detail: 'Format "i18next-json" resolves to an adapter.',
      },
      {
        id: "provider",
        title: "Provider",
        status: "pass",
        detail: 'Provider "anthropic" resolves to a factory.',
      },
      {
        id: "api-key",
        title: "API key environment variable",
        status: "fail",
        detail: "The ANTHROPIC_API_KEY environment variable is not set.",
      },
      {
        id: "source-file",
        title: "Source locale file",
        status: "fail",
        detail: "The source locale file was not found at /proj/locales/en.json.",
      },
    ],
  });
}

const ESC = "\x1b[";

function warningReport(): DoctorResult {
  return makeDoctorResult({
    ok: true,
    checks: [
      {
        id: "config",
        title: "Configuration",
        status: "pass",
        detail: "Loaded /proj/.verbatrarc.json.",
      },
      {
        id: "locale-codes",
        title: "Locale codes",
        status: "warn",
        detail: '"iw" is canonically "he".',
      },
    ],
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("run doctor: SDK delegation, rendering, and exit codes", () => {
  it("delegates to doctor with the resolved cwd and exits 0 on a clean project", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["doctor", "--cwd", "/proj"], deps, cap.streams);

    expect(code).toBe(0);
    expect(calls.doctor).toEqual([{ cwd: "/proj" }]);
    expect(cap.out()).toContain("verbatra doctor");
    expect(cap.out()).toContain("[ok  ] Configuration: Loaded /proj/verbatra.config.ts.");
    expect(cap.out()).toMatch(/no problems found\n$/);
  });

  it("loads the config inside the SDK flow, never through the CLI loadConfig dependency", async () => {
    const { deps, calls } = recordingDeps();

    await run(["doctor", "--cwd", "/proj"], deps, captureStreams().streams);

    expect(calls.loadConfig).toEqual([]);
    expect(calls.loadConfigWithMeta).toEqual([]);
  });

  it("exits 1 and still prints every failing check when the project has problems", async () => {
    const { deps } = recordingDeps({ doctor: async () => failingReport() });
    const cap = captureStreams();

    const code = await run(["doctor"], deps, cap.streams);

    expect(code).toBe(1);
    expect(cap.out()).toContain(
      "[fail] API key environment variable: The ANTHROPIC_API_KEY environment variable is not set.",
    );
    expect(cap.out()).toContain(
      "[fail] Source locale file: The source locale file was not found at /proj/locales/en.json.",
    );
    expect(cap.out()).toContain("2 problems found (run verbatra doctor again after fixing them)");
  });

  it("counts a single problem in the singular", async () => {
    const report = failingReport();
    const { deps } = recordingDeps({
      doctor: async () => ({
        ok: false,
        checks: report.checks.filter((entry) => entry.id !== "source-file"),
      }),
    });
    const cap = captureStreams();

    expect(await run(["doctor"], deps, cap.streams)).toBe(1);
    expect(cap.out()).toContain("1 problem found (run verbatra doctor again after fixing it)");
  });

  it("renders skipped checks distinctly from failed ones", async () => {
    const { deps } = recordingDeps({
      doctor: async () => ({
        ok: false,
        checks: [
          {
            id: "config",
            title: "Configuration",
            status: "fail",
            detail: "No verbatra configuration found.",
          },
          {
            id: "provider",
            title: "Provider",
            status: "skipped",
            detail: "Not checked: the configuration could not be loaded.",
          },
        ],
      }),
    });
    const cap = captureStreams();

    expect(await run(["doctor"], deps, cap.streams)).toBe(1);
    expect(cap.out()).toContain("[fail] Configuration: No verbatra configuration found.");
    expect(cap.out()).toContain("[skip] Provider: Not checked");
    expect(cap.out()).toContain("1 problem found");
  });

  it("renders a warn check as [warn] and keeps exit code 0 and the no-problems trailer", async () => {
    const { deps } = recordingDeps({ doctor: async () => warningReport() });
    const cap = captureStreams();

    expect(await run(["doctor"], deps, cap.streams)).toBe(0);
    expect(cap.out()).toContain("[ok  ] Configuration: Loaded /proj/.verbatrarc.json.");
    expect(cap.out()).toContain('[warn] Locale codes: "iw" is canonically "he".');
    expect(cap.out()).toMatch(/no problems found, 1 warning\n$/);
  });

  it("counts several warnings in the plural in the no-problems trailer", async () => {
    const report = warningReport();
    const { deps } = recordingDeps({
      doctor: async () => ({ ...report, checks: [...report.checks, ...report.checks.slice(1)] }),
    });
    const cap = captureStreams();

    expect(await run(["doctor"], deps, cap.streams)).toBe(0);
    expect(cap.out()).toMatch(/no problems found, 2 warnings\n$/);
  });

  it("carries a warn status in the --json envelope and exits 0", async () => {
    const { deps } = recordingDeps({ doctor: async () => warningReport() });
    const cap = captureStreams();

    expect(await run(["doctor", "--json"], deps, cap.streams)).toBe(0);
    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: true,
      command: "doctor",
      result: { ok: true, checks: [{ status: "pass" }, { status: "warn" }] },
    });
  });

  it("colors each status label on a color stdout and leaves a piped stdout plain", async () => {
    const { deps } = recordingDeps({ doctor: async () => warningReport() });
    const colored = captureStreams();
    const piped = captureStreams();
    const facts = { env: {}, stdinIsTty: true, stderrIsTty: true, stdoutIsTty: true };

    await run(["doctor"], deps, colored.streams, {}, facts);
    await run(["doctor"], deps, piped.streams, {}, { ...facts, stdoutIsTty: false });

    expect(colored.out()).toContain(`${ESC}32m[ok  ]${ESC}39m Configuration`);
    expect(colored.out()).toContain(`${ESC}33m[warn]${ESC}39m Locale codes`);
    expect(piped.out()).not.toContain(ESC);
    expect(piped.out()).toContain("[warn] Locale codes");
  });

  it("--json prints one success envelope carrying the per-check verdicts, and still exits 1", async () => {
    const report = failingReport();
    const { deps } = recordingDeps({ doctor: async () => report });
    const cap = captureStreams();

    const code = await run(["doctor", "--json"], deps, cap.streams);

    expect(code).toBe(1);
    expect(parseEnvelope(cap.out())).toEqual({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "doctor",
      result: report,
    });
    expect(cap.err()).toBe("");
  });

  it("forwards --config as configPath", async () => {
    const { deps, calls } = recordingDeps();

    await run(
      ["doctor", "--cwd", "/proj", "--config", "custom.json"],
      deps,
      captureStreams().streams,
    );

    expect(calls.doctor).toEqual([{ cwd: "/proj", configPath: "custom.json" }]);
  });

  it("a thrown SDK error renders to stderr and exits 2 with clean stdout", async () => {
    const { deps } = recordingDeps({
      doctor: async () => {
        throw Object.assign(new Error("No verbatra configuration file at /proj/nope.json."), {
          code: "CONFIG_NOT_FOUND",
        });
      },
    });
    const cap = captureStreams();

    const code = await run(["doctor", "--config", "nope.json"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[CONFIG_NOT_FOUND]");
    expect(cap.out()).toBe("");
  });

  it("emits an error envelope on stdout for an exit-2 failure under --json", async () => {
    const { deps } = recordingDeps({
      doctor: async () => {
        throw Object.assign(new Error("No verbatra configuration file at /proj/nope.json."), {
          code: "CONFIG_NOT_FOUND",
        });
      },
    });
    const cap = captureStreams();

    const code = await run(["doctor", "--config", "nope.json", "--json"], deps, cap.streams);

    expect(code).toBe(2);
    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: false,
      command: "doctor",
      code: "CONFIG_NOT_FOUND",
    });
  });

  it("rejects an unknown flag as a usage error without calling the SDK", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["doctor", "--locales", "de"], deps, cap.streams);

    expect(code).toBe(2);
    expect(calls.doctor).toEqual([]);
  });

  it("never prints an API key value on stdout or stderr, even with one set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", KEY_CANARY);
    const { deps } = recordingDeps({ doctor: async () => failingReport() });
    const cap = captureStreams();

    await run(["doctor"], deps, cap.streams);

    expect(cap.out()).not.toContain(KEY_CANARY);
    expect(cap.out()).not.toContain(KEY_CANARY.slice(0, 8));
    expect(cap.err()).not.toContain(KEY_CANARY);
    expect(cap.err()).not.toContain(KEY_CANARY.slice(0, 8));
    expect(cap.out()).toContain("ANTHROPIC_API_KEY");
  });

  it("is listed in the top-level help", async () => {
    const cap = captureStreams();

    await run(["--help"], recordingDeps().deps, cap.streams);

    expect(cap.out()).toContain("doctor");
  });
});

function literalReport(overrides: Partial<DoctorResult> = {}): DoctorResult {
  return makeDoctorResult({
    ok: false,
    checks: [
      {
        id: "config",
        title: "Configuration",
        status: "pass",
        detail: "Loaded /proj/.verbatrarc.json.",
      },
      {
        id: "untranslated-literals",
        title: "Untranslated literals",
        status: "fail",
        detail: "Scanned 2 source files: 1 untranslated literal found (1 suppressed).",
      },
    ],
    literals: {
      scannedFiles: 2,
      findings: [
        { file: "src/app.tsx", line: 12, column: 7, text: "Welcome back", truncated: false },
      ],
      suppressed: [
        {
          file: "src/app.tsx",
          line: 14,
          column: 9,
          text: "Acme Inc.",
          truncated: false,
          reason: "ignore-list",
        },
      ],
      diagnostics: [{ file: "src/broken.tsx", reason: "unparseable" }],
    },
    ...overrides,
  });
}

describe("run doctor --literals", () => {
  it("asks the SDK for the literal scan and exits 1 with every finding located", async () => {
    const { deps, calls } = recordingDeps({ doctor: async () => literalReport() });
    const cap = captureStreams();

    const code = await run(["doctor", "--literals", "--cwd", "/proj"], deps, cap.streams);

    expect(code).toBe(1);
    expect(calls.doctor).toEqual([
      { cwd: "/proj", literals: true, onProgress: expect.any(Function) },
    ]);
    expect(cap.out()).toContain("[fail] Untranslated literals: Scanned 2 source files");
    expect(cap.out()).toContain('    src/app.tsx:12:7  "Welcome back"');
    expect(cap.out()).toContain('    suppressed (ignore-list) src/app.tsx:14:9  "Acme Inc."');
    expect(cap.out()).toContain("    not scanned (unparseable) src/broken.tsx");
  });

  it("neutralizes control, bidi, and separator characters in the literal text it echoes back", async () => {
    const hostile = "\u001b[31mred\u009b2J\u202eflip\u2028line";
    const report = literalReport({
      literals: {
        scannedFiles: 1,
        findings: [{ file: "src/app.tsx", line: 1, column: 1, text: hostile, truncated: false }],
        suppressed: [
          {
            file: "src/app.tsx",
            line: 2,
            column: 1,
            text: hostile,
            truncated: false,
            reason: "ignore-list",
          },
        ],
        diagnostics: [],
      },
    });
    const { deps } = recordingDeps({ doctor: async () => report });
    const cap = captureStreams();

    await run(["doctor", "--literals"], deps, cap.streams);

    expect(cap.out()).toContain('    src/app.tsx:1:1  " [31mred 2J flip line"');
    expect(cap.out()).toContain(
      '    suppressed (ignore-list) src/app.tsx:2:1  " [31mred 2J flip line"',
    );
    for (const character of ["\u001b", "\u009b", "\u202e", "\u2028"]) {
      expect(cap.out()).not.toContain(character);
    }
  });

  it("exits 0 and reports zero on a project with no findings", async () => {
    const clean = literalReport({
      ok: true,
      literals: { scannedFiles: 3, findings: [], suppressed: [], diagnostics: [] },
    });
    const { deps } = recordingDeps({ doctor: async () => clean });
    const cap = captureStreams();

    const code = await run(["doctor", "--literals"], deps, cap.streams);

    expect(code).toBe(0);
    expect(cap.out()).toContain("no problems found");
  });

  it("emits the standard success envelope carrying the scan under result", async () => {
    const report = literalReport();
    const { deps } = recordingDeps({ doctor: async () => report });
    const cap = captureStreams();

    const code = await run(["doctor", "--literals", "--json"], deps, cap.streams);

    expect(code).toBe(1);
    expect(parseEnvelope(cap.out())).toEqual({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "doctor",
      result: report,
    });
  });

  it("does not load dotenv files, so no API key reaches the environment", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verbatra-cli-literals-"));
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    try {
      await writeFile(join(dir, ".env"), `ANTHROPIC_API_KEY=${KEY_CANARY}\n`, "utf8");
      const { deps } = recordingDeps();

      await run(["doctor", "--literals", "--cwd", dir], deps, captureStreams().streams);
      expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();

      await run(["doctor", "--cwd", dir], deps, captureStreams().streams);
      expect(process.env.ANTHROPIC_API_KEY).toBe(KEY_CANARY);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("documents the flag in the command help", async () => {
    const cap = captureStreams();

    await run(["doctor", "--help"], recordingDeps().deps, cap.streams);

    expect(cap.out()).toContain("--literals");
  });
});

describe("run doctor: the informational plural-rules check", () => {
  it("warns about a target locale without plural rules yet still reports no problems and exits 0", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verbatra-cli-plural-rules-"));
    vi.stubEnv("ANTHROPIC_API_KEY", KEY_CANARY);
    try {
      await writeFile(
        join(dir, ".verbatrarc.json"),
        JSON.stringify({
          sourceLocale: "en",
          targetLocales: ["de", "tlh"],
          format: "i18next-json",
          files: { pattern: "locales/{locale}.json" },
          provider: { id: "anthropic", options: { model: "claude-test", maxTokens: 1024 } },
        }),
        "utf8",
      );
      await mkdir(join(dir, "locales"));
      await writeFile(join(dir, "locales", "en.json"), JSON.stringify({ hi: "Hi" }), "utf8");
      const { deps } = recordingDeps({ doctor });
      const cap = captureStreams();

      const code = await run(["doctor", "--cwd", dir], deps, cap.streams);

      expect(code).toBe(0);
      expect(cap.out()).toMatch(/\[warn\] Plural rules: .*"tlh"/);
      expect(cap.out()).toContain("no problems found");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("run doctor: the informational locale-codes check", () => {
  it("warns with the canonical form of a deprecated target locale yet still exits 0", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verbatra-cli-locale-codes-"));
    vi.stubEnv("ANTHROPIC_API_KEY", KEY_CANARY);
    try {
      await writeFile(
        join(dir, ".verbatrarc.json"),
        JSON.stringify({
          sourceLocale: "en",
          targetLocales: ["de", "iw"],
          format: "i18next-json",
          files: { pattern: "locales/{locale}.json" },
          provider: { id: "anthropic", options: { model: "claude-test", maxTokens: 1024 } },
        }),
        "utf8",
      );
      await mkdir(join(dir, "locales"));
      await writeFile(join(dir, "locales", "en.json"), JSON.stringify({ hi: "Hi" }), "utf8");
      const { deps } = recordingDeps({ doctor });
      const cap = captureStreams();

      const code = await run(["doctor", "--cwd", dir], deps, cap.streams);

      expect(code).toBe(0);
      expect(cap.out()).toMatch(/\[warn\] Locale codes: "iw" is canonically "he"/);
      expect(cap.out()).toContain("no problems found");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function localesReport(): DoctorResult {
  return makeDoctorResult({
    ok: false,
    checks: [
      {
        id: "locales",
        title: "Locale support",
        status: "fail",
        detail:
          'Provider "deepl", language table of 2026-09-28 (static): 1 of 2 target locales ' +
          'supported, 0 unverified; unsupported: "chr". 1 warning.',
      },
    ],
    locales: {
      provider: "deepl",
      coverage: "listed",
      tableVersion: "2026-09-28",
      tableOrigin: "live",
      live: { status: "refreshed", detail: "Fetched 2 languages from api.deepl.com." },
      source: {
        locale: "en-US",
        providerCode: "EN",
        mapped: true,
        support: "supported",
        warnings: [],
      },
      locales: [
        {
          locale: "sv",
          providerCode: "SV",
          mapped: false,
          support: "supported",
          glossary: true,
          formality: false,
          warnings: [
            {
              code: "FORMALITY_UNSUPPORTED_BY_PROVIDER",
              message: 'Provider "deepl" has no formality control for "sv".',
            },
          ],
        },
        {
          locale: "chr",
          providerCode: "CHR",
          mapped: false,
          support: "unsupported",
          glossary: false,
          formality: false,
          warnings: [],
        },
      ],
    },
  });
}

describe("run doctor --locales and --live", () => {
  it("prints the per-locale provider report under --locales", async () => {
    const { deps, calls } = recordingDeps({ doctor: async () => localesReport() });
    const cap = captureStreams();

    const code = await run(["doctor", "--locales", "--cwd", "/proj"], deps, cap.streams);

    expect(code).toBe(1);
    expect(calls.doctor).toEqual([{ cwd: "/proj" }]);
    expect(cap.out()).toContain(
      "  locale support (deepl, language table of 2026-09-28, live)\n" +
        "    live language list refreshed: Fetched 2 languages from api.deepl.com.\n" +
        "    en-US  sent as EN (localeMap)  source, supported\n" +
        "    sv  sent as SV  supported  glossary: yes  formality: no\n" +
        '      warning [FORMALITY_UNSUPPORTED_BY_PROVIDER] Provider "deepl" has no formality control for "sv".\n' +
        "    chr  sent as CHR  unsupported  glossary: no  formality: no\n",
    );
  });

  it("keeps the per-locale report out of the plain human report", async () => {
    const { deps } = recordingDeps({ doctor: async () => localesReport() });
    const cap = captureStreams();

    await run(["doctor"], deps, cap.streams);

    expect(cap.out()).toContain("[fail] Locale support:");
    expect(cap.out()).not.toContain("locale support (deepl");
  });

  it("names an LLM provider's open coverage and prints nothing for a provider without a report", async () => {
    const report = localesReport();
    const open = makeDoctorResult({
      locales: {
        ...(report.locales as NonNullable<DoctorResult["locales"]>),
        provider: "anthropic",
        coverage: "open",
        tableOrigin: "static",
        locales: [],
      },
    });
    const { deps } = recordingDeps({ doctor: async () => open });
    const cap = captureStreams();

    await run(["doctor", "--locales"], deps, cap.streams);
    expect(cap.out()).toContain(
      "  locale support (anthropic, accepts any locale, well-tested list of 2026-09-28)",
    );

    const none = captureStreams();
    await run(["doctor", "--locales"], recordingDeps().deps, none.streams);
    expect(none.out()).not.toContain("locale support");
  });

  it("asks the SDK for the live list under --live, which implies --locales", async () => {
    const { deps, calls } = recordingDeps({ doctor: async () => localesReport() });
    const cap = captureStreams();

    await run(["doctor", "--live", "--cwd", "/proj"], deps, cap.streams);

    expect(calls.doctor).toEqual([{ cwd: "/proj", live: true }]);
    expect(cap.out()).toContain("  locale support (deepl");
    expect(cap.err()).toContain("checking the setup and fetching the provider's language list");
  });

  it("carries the report under result.locales in the JSON envelope", async () => {
    const report = localesReport();
    const { deps } = recordingDeps({ doctor: async () => report });
    const cap = captureStreams();

    await run(["doctor", "--json"], deps, cap.streams);

    expect(parseEnvelope(cap.out())).toEqual({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "doctor",
      result: report,
    });
  });

  it.each([
    [["--literals", "--locales"], "--locales"],
    [["--literals", "--live"], "--live"],
  ])("refuses %j as a usage error with exit 2", async (flags, named) => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["doctor", ...flags], deps, cap.streams);

    expect(code).toBe(2);
    expect(calls.doctor).toEqual([]);
    expect(cap.err()).toContain("[INVALID_OPTION]");
    expect(cap.err()).toContain(named);
  });

  it("documents both flags in the command help", async () => {
    const cap = captureStreams();

    await run(["doctor", "--help"], recordingDeps().deps, cap.streams);

    expect(cap.out()).toContain("--locales");
    expect(cap.out()).toContain("--live");
  });
});
