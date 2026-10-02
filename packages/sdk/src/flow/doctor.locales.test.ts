import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoadedConfig } from "../config/load-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeTempDir } from "../test-support.js";
import { type DoctorCheck, type DoctorResult, doctor } from "./doctor.js";

const DEEPL_KEY = "deepl-key-value-canary";

async function doctorFor(config: VerbatraConfig, live = false): Promise<DoctorResult> {
  const loaded: LoadedConfig = {
    config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return doctor({ cwd: await makeTempDir(), live }, { loadConfig: async () => loaded });
}

function localesCheck(result: DoctorResult): DoctorCheck | undefined {
  return result.checks.find((entry) => entry.id === "locales");
}

const deepl = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ provider: { id: "deepl", options: {} }, ...overrides });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("doctor: the locales check", () => {
  it("passes and carries the per-locale report when the provider supports every locale", async () => {
    const result = await doctorFor(deepl({ targetLocales: ["de", "fr"] }));

    expect(localesCheck(result)).toEqual({
      id: "locales",
      title: "Locale support",
      status: "pass",
      detail:
        'Provider "deepl", language table of 2026-09-28 (static): 2 of 2 target locales ' +
        "supported, 0 unverified; no configured locale is unsupported.",
    });
    expect(result.locales?.locales.map((entry) => [entry.locale, entry.providerCode])).toEqual([
      ["de", "DE"],
      ["fr", "FR"],
    ]);
    expect(result.locales?.live).toBeUndefined();
  });

  it("fails on an unsupported locale, the one translate would refuse, and counts warnings", async () => {
    const result = await doctorFor(deepl({ targetLocales: ["de", "sv", "chr"], tone: "informal" }));

    expect(result.ok).toBe(false);
    expect(localesCheck(result)?.status).toBe("fail");
    expect(localesCheck(result)?.detail).toBe(
      'Provider "deepl", language table of 2026-09-28 (static): 2 of 3 target locales ' +
        'supported, 0 unverified; unsupported: "chr". 1 warning.',
    );
  });

  it("passes an LLM provider for any locale and counts the warnings", async () => {
    const result = await doctorFor(baseConfig({ targetLocales: ["de", "sw", "yo"] }));

    expect(localesCheck(result)?.status).toBe("pass");
    expect(localesCheck(result)?.detail).toBe(
      'Provider "anthropic" is an LLM and accepts any locale (well-tested list of 2026-09-28). ' +
        "2 warnings.",
    );
    expect(result.locales?.coverage).toBe("open");
  });

  it("skips the check for provider none and reports no locales", async () => {
    const result = await doctorFor(baseConfig({ provider: { id: "none", options: {} } }));

    expect(localesCheck(result)?.status).toBe("skipped");
    expect(localesCheck(result)?.detail).toContain("Not applicable");
    expect(result.locales).toBeUndefined();
  });

  it("sends no request without the live option", async () => {
    vi.stubEnv("DEEPL_API_KEY", DEEPL_KEY);
    const send = vi.fn();
    vi.stubGlobal("fetch", send);

    await doctorFor(deepl());

    expect(send).not.toHaveBeenCalled();
  });
});

describe("doctor: the live language list", () => {
  it("judges the locales against the provider's current list when the key is set", async () => {
    vi.stubEnv("DEEPL_API_KEY", DEEPL_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          { lang: "en", usable_as_source: true, usable_as_target: false },
          { lang: "chr", usable_as_source: true, usable_as_target: true },
        ]),
      ),
    );

    const result = await doctorFor(deepl({ targetLocales: ["chr"] }), true);

    expect(localesCheck(result)?.status).toBe("pass");
    expect(result.locales?.tableOrigin).toBe("live");
    expect(result.locales?.live?.status).toBe("refreshed");
    expect(localesCheck(result)?.detail).toContain(
      "Live language list refreshed: Fetched 2 languages from api.deepl.com",
    );
    expect(JSON.stringify(result)).not.toContain(DEEPL_KEY);
  });

  it("falls back to the static table and says why when the key is not set", async () => {
    vi.stubEnv("DEEPL_API_KEY", "");
    const result = await doctorFor(deepl({ targetLocales: ["de"] }), true);

    expect(result.locales?.tableOrigin).toBe("static");
    expect(result.locales?.live).toEqual({
      status: "skipped",
      detail:
        "DEEPL_API_KEY is not set, so no request was sent and the static table of 2026-09-28 was used.",
    });
  });
});
