import { afterEach, describe, expect, it, vi } from "vitest";
import type { MachineProviderConfig } from "../config/provider-config.js";
import { refreshLanguageTable } from "./locale-capabilities-live.js";

const DEEPL: MachineProviderConfig = { id: "deepl", options: {} };
const GOOGLE: MachineProviderConfig = { id: "google-translate", options: {} };
const DEEPL_KEY = "deepl-key-value-canary";

const v3Languages = [
  {
    lang: "de",
    usable_as_source: true,
    usable_as_target: true,
    features: { glossary: {}, formality: {} },
  },
  { lang: "en", usable_as_source: true, usable_as_target: false, features: {} },
  { lang: "en-US", usable_as_source: false, usable_as_target: true, features: {} },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("refreshLanguageTable", () => {
  it("skips an LLM provider, which has no language list", async () => {
    const outcome = await refreshLanguageTable(
      { id: "gemini", options: { model: "m", maxOutputTokens: 64 } },
      undefined,
      {},
    );

    expect(outcome.refresh.status).toBe("skipped");
    expect(outcome.refresh.detail).toContain("accepts any locale");
    expect(outcome.table).toBeUndefined();
  });

  it("skips the request when the provider's key variable is not set", async () => {
    const send = vi.fn();
    vi.stubGlobal("fetch", send);

    const outcome = await refreshLanguageTable(GOOGLE, undefined, {});

    expect(outcome.refresh).toEqual({
      status: "skipped",
      detail:
        "GOOGLE_TRANSLATE_API_KEY is not set, so no request was sent and the static table of 2026-09-28 was used.",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("skips the request when the network policy refuses the provider's host", async () => {
    const send = vi.fn();
    vi.stubGlobal("fetch", send);

    const outcome = await refreshLanguageTable(
      DEEPL,
      { policy: "local-only" },
      { DEEPL_API_KEY: DEEPL_KEY },
    );

    expect(outcome.refresh.status).toBe("skipped");
    expect(outcome.refresh.detail).toContain("The network policy refuses api.deepl.com");
    expect(send).not.toHaveBeenCalled();
  });

  it("fails closed on an invalid network policy variable without sending anything", async () => {
    const send = vi.fn();
    vi.stubGlobal("fetch", send);

    const outcome = await refreshLanguageTable(DEEPL, undefined, {
      DEEPL_API_KEY: DEEPL_KEY,
      VERBATRA_NETWORK_POLICY: "nowhere",
    });

    expect(outcome.refresh.status).toBe("failed");
    expect(outcome.refresh.detail).toContain("[CONFIG_INVALID]");
    expect(send).not.toHaveBeenCalled();
  });

  it("fetches the provider's list when the key is set and the host is permitted", async () => {
    vi.stubEnv("DEEPL_API_KEY", DEEPL_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(v3Languages)),
    );

    const outcome = await refreshLanguageTable(DEEPL, undefined, { DEEPL_API_KEY: DEEPL_KEY });

    expect(outcome.refresh).toEqual({
      status: "refreshed",
      detail: "Fetched 3 languages from api.deepl.com; no translation quota was used.",
    });
    expect(outcome.table?.origin).toBe("live");
  });

  it("checks every request against a restrictive policy that permits the host", async () => {
    vi.stubEnv("DEEPL_API_KEY", DEEPL_KEY);
    const send = vi.fn(async () => Response.json(v3Languages));
    vi.stubGlobal("fetch", send);

    const outcome = await refreshLanguageTable(
      DEEPL,
      { policy: "allowlist", allowedHosts: ["api.deepl.com"] },
      { DEEPL_API_KEY: DEEPL_KEY },
    );

    expect(outcome.refresh.status).toBe("refreshed");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("reports a failed request with its code and never the key", async () => {
    vi.stubEnv("DEEPL_API_KEY", DEEPL_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 403 })),
    );

    const outcome = await refreshLanguageTable(DEEPL, undefined, { DEEPL_API_KEY: DEEPL_KEY });

    expect(outcome.refresh.status).toBe("failed");
    expect(outcome.refresh.detail).toContain("[AUTH_FAILED]");
    expect(outcome.refresh.detail).toContain("The static table was used.");
    expect(outcome.refresh.detail).not.toContain(DEEPL_KEY);
    expect(outcome.table).toBeUndefined();
  });
});

describe("refreshLanguageTable: LibreTranslate", () => {
  const LIBRETRANSLATE: MachineProviderConfig = {
    id: "libretranslate",
    options: { baseUrl: "http://127.0.0.1:5000" },
  };

  it("fetches the server's language list without any key, even under local-only", async () => {
    const send = vi.fn(
      async (_input: string, _init?: RequestInit) =>
        new Response(JSON.stringify([{ code: "en", name: "English", targets: ["de"] }]), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", send);

    const outcome = await refreshLanguageTable(LIBRETRANSLATE, { policy: "local-only" }, {});

    expect(outcome.refresh.status).toBe("refreshed");
    expect(outcome.refresh.detail).toContain("Fetched 1 languages from 127.0.0.1");
    expect(outcome.table?.languages.map((language) => language.code)).toEqual(["en"]);
    expect(String(send.mock.calls[0]?.[0])).toBe("http://127.0.0.1:5000/languages");
  });

  it("skips a remote server the local-only policy refuses", async () => {
    const send = vi.fn();
    vi.stubGlobal("fetch", send);

    const outcome = await refreshLanguageTable(
      { id: "libretranslate", options: { baseUrl: "http://203.0.113.7:5000" } },
      { policy: "local-only" },
      {},
    );

    expect(outcome.refresh.status).toBe("skipped");
    expect(outcome.refresh.detail).toContain("203.0.113.7");
    expect(send).not.toHaveBeenCalled();
  });
});
