import { describe, expect, it } from "vitest";
import type { NetworkPolicy } from "./policy.js";
import { judgeProviderEndpoint, UNPARSEABLE_HOST } from "./preflight.js";

const LOCAL_ONLY: NetworkPolicy = {
  rules: [{ source: "config", policy: "local-only", allowedHosts: [] }],
};

function localOnlyAllowing(...allowedHosts: string[]): NetworkPolicy {
  return { rules: [{ source: "config", policy: "local-only", allowedHosts }] };
}

describe("judgeProviderEndpoint: hosted providers", () => {
  it.each(["anthropic", "openai", "gemini", "deepl", "google-translate"] as const)(
    "refuses %s under local-only without resolving anything",
    (id) => {
      const judgement = judgeProviderEndpoint(LOCAL_ONLY, { id }, {});
      expect(judgement.kind).toBe("refused");
      expect(judgement.kind === "refused" ? judgement.reason : "").toContain(
        'is not permitted by the "local-only" network policy',
      );
    },
  );

  it("permits a hosted provider whose endpoint is allowlisted", () => {
    expect(
      judgeProviderEndpoint(localOnlyAllowing("api.anthropic.com"), { id: "anthropic" }, {}),
    ).toMatchObject({ kind: "permitted", host: "api.anthropic.com", deferred: false });
  });

  it("permits everything and still reports the endpoint when nothing is restrictive", () => {
    expect(judgeProviderEndpoint({ rules: [] }, { id: "openai" }, {})).toMatchObject({
      kind: "permitted",
      host: "api.openai.com",
      deferred: false,
    });
  });

  it("refuses Gemini in Vertex AI mode even when its host is allowlisted", () => {
    const judgement = judgeProviderEndpoint(
      localOnlyAllowing("*.googleapis.com"),
      { id: "gemini" },
      { GOOGLE_GENAI_USE_VERTEXAI: "true" },
    );
    expect(judgement.kind).toBe("refused");
  });

  it("follows a base-URL override into a local endpoint", () => {
    expect(
      judgeProviderEndpoint(
        LOCAL_ONLY,
        { id: "anthropic" },
        { ANTHROPIC_BASE_URL: "http://127.0.0.1:4000" },
      ),
    ).toMatchObject({ kind: "permitted", host: "127.0.0.1" });
  });

  it("refuses an override that does not parse, and never echoes it", () => {
    const judgement = judgeProviderEndpoint(
      LOCAL_ONLY,
      { id: "openai" },
      { OPENAI_BASE_URL: "not a url secret-token" },
    );
    expect(judgement).toMatchObject({ kind: "refused", host: UNPARSEABLE_HOST });
    const reason = judgement.kind === "refused" ? judgement.reason : "";
    expect(reason).toContain("OPENAI_BASE_URL");
    expect(reason).not.toContain("secret-token");
  });
});

describe("judgeProviderEndpoint: openai-compatible", () => {
  const target = (baseUrl: string) => ({ id: "openai-compatible" as const, baseUrl });

  it("defers localhost to the request-time check, which requires loopback addresses", () => {
    expect(
      judgeProviderEndpoint(LOCAL_ONLY, target("http://localhost:11434/v1"), {}),
    ).toMatchObject({ kind: "permitted", deferred: true });
  });

  it.each(["http://127.0.0.1:11434/v1", "http://[::1]:8080", "http://192.168.1.5:8000/v1"])(
    "permits the local base URL %s",
    (baseUrl) => {
      expect(judgeProviderEndpoint(LOCAL_ONLY, target(baseUrl), {})).toMatchObject({
        kind: "permitted",
        deferred: false,
      });
    },
  );

  it("refuses a public address", () => {
    expect(judgeProviderEndpoint(LOCAL_ONLY, target("https://8.8.8.8/v1"), {}).kind).toBe(
      "refused",
    );
  });

  it("defers a name it cannot classify to the request-time check", () => {
    expect(judgeProviderEndpoint(LOCAL_ONLY, target("http://llm.internal/v1"), {})).toMatchObject({
      kind: "permitted",
      deferred: true,
    });
  });

  it("refuses a base URL without a host", () => {
    expect(judgeProviderEndpoint(LOCAL_ONLY, target("file:///tmp/socket"), {})).toMatchObject({
      kind: "refused",
      host: UNPARSEABLE_HOST,
    });
  });
});

describe("judgeProviderEndpoint: proxies", () => {
  const local = { id: "openai-compatible" as const, baseUrl: "http://127.0.0.1:8080" };
  const fetchProxy = (value: string) => ({ NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: value });

  it("permits a local proxy address", () => {
    expect(judgeProviderEndpoint(LOCAL_ONLY, local, fetchProxy("http://10.0.0.3:3128")).kind).toBe(
      "permitted",
    );
  });

  it("refuses a public proxy address", () => {
    const judgement = judgeProviderEndpoint(LOCAL_ONLY, local, fetchProxy("http://8.8.8.8:3128"));
    expect(judgement.kind === "refused" ? judgement.reason : "").toContain(
      "the proxy host 8.8.8.8 from HTTPS_PROXY is not permitted",
    );
  });

  it("refuses a proxy name that is not listed, since it is never resolved per request", () => {
    const judgement = judgeProviderEndpoint(LOCAL_ONLY, local, fetchProxy("proxy.corp:3128"));
    expect(judgement.kind === "refused" ? judgement.reason : "").toContain(
      "must be an address or a host name listed in allowedHosts",
    );
    expect(
      judgeProviderEndpoint(localOnlyAllowing("proxy.corp"), local, fetchProxy("proxy.corp:3128"))
        .kind,
    ).toBe("permitted");
  });

  it("refuses a proxy value that cannot be parsed", () => {
    const judgement = judgeProviderEndpoint(LOCAL_ONLY, local, fetchProxy("http://["));
    expect(judgement.kind === "refused" ? judgement.reason : "").toContain("could not be parsed");
  });

  it("checks the proxy for DeepL without the Node switch", () => {
    const judgement = judgeProviderEndpoint(
      localOnlyAllowing("api.deepl.com"),
      { id: "deepl" },
      { HTTPS_PROXY: "http://8.8.8.8:3128" },
    );
    expect(judgement.kind).toBe("refused");
  });
});

describe("judgeProviderEndpoint: the refusing rule's source", () => {
  it("names the environment when the environment's rule refuses the host", () => {
    const policy: NetworkPolicy = {
      rules: [
        { source: "config", policy: "any", allowedHosts: [] },
        { source: "environment", policy: "local-only", allowedHosts: [] },
      ],
    };
    expect(judgeProviderEndpoint(policy, { id: "openai" }, {})).toMatchObject({
      kind: "refused",
      refusedBy: "environment",
    });
  });

  it("names the config when the config's rule refuses the proxy host", () => {
    const local = { id: "openai-compatible" as const, baseUrl: "http://127.0.0.1:8080" };
    const judgement = judgeProviderEndpoint(LOCAL_ONLY, local, {
      NODE_USE_ENV_PROXY: "1",
      HTTPS_PROXY: "http://8.8.8.8:3128",
    });
    expect(judgement).toMatchObject({ kind: "refused", refusedBy: "config" });
  });

  it("names no source when no single rule refused", () => {
    const local = { id: "openai-compatible" as const, baseUrl: "http://127.0.0.1:8080" };
    const judgement = judgeProviderEndpoint(LOCAL_ONLY, local, {
      NODE_USE_ENV_PROXY: "1",
      HTTPS_PROXY: "proxy.corp:3128",
    });
    expect(judgement.kind).toBe("refused");
    expect(judgement).not.toHaveProperty("refusedBy");
  });
});
