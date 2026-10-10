import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";
import {
  CSP_ENFORCED,
  contentSecurityPolicy,
  securityHeaders,
  UMAMI_ORIGIN,
} from "./security-headers.mjs";

const SCRIPT_HASHES = [
  "'sha256-OBTN3RiyCV4Bq7dFqZ5a2pAXjnCcCYeTJMO2I/LYKeo='",
  "'sha256-U9enSfdMGNYMKuQiy+D/nx8SR+dwM4pFuk2q1aglmg0='",
];

const BASE_DIRECTIVES = [
  "default-src 'self'",
  `script-src 'self' ${UMAMI_ORIGIN}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${UMAMI_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const ENFORCED_POLICY = [...BASE_DIRECTIVES, "upgrade-insecure-requests"].join("; ");

function directives(value: string): Map<string, string> {
  return new Map(
    value.split("; ").map((directive) => {
      const [name = "", ...sources] = directive.split(" ");
      return [name, sources.join(" ")];
    }),
  );
}

describe("contentSecurityPolicy", () => {
  it("is enforced, not report-only", () => {
    expect(CSP_ENFORCED).toBe(true);
    expect(contentSecurityPolicy({ enforce: CSP_ENFORCED, isDev: false })).toEqual({
      key: "Content-Security-Policy",
      value: ENFORCED_POLICY,
    });
  });

  it("falls back to the report-only header name without upgrading requests", () => {
    const header = contentSecurityPolicy({ enforce: false, isDev: false });
    expect(header.key).toBe("Content-Security-Policy-Report-Only");
    expect(header.value).toBe(BASE_DIRECTIVES.join("; "));
  });

  it("never allows inline or eval scripts in production, enforced or not", () => {
    for (const enforce of [true, false]) {
      const scriptSrc = directives(
        contentSecurityPolicy({ enforce, isDev: false, scriptHashes: SCRIPT_HASHES }).value,
      ).get("script-src");
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");
      expect(scriptSrc).not.toContain("'strict-dynamic'");
    }
  });

  it("allows exactly the given inline script hashes in production", () => {
    const policy = directives(
      contentSecurityPolicy({ enforce: true, isDev: false, scriptHashes: SCRIPT_HASHES }).value,
    );
    expect(policy.get("script-src")).toBe(`'self' ${SCRIPT_HASHES.join(" ")} ${UMAMI_ORIGIN}`);
  });

  it("allows inline and eval scripts only in development, where nothing is prerendered", () => {
    const dev = directives(
      contentSecurityPolicy({ enforce: true, isDev: true, scriptHashes: SCRIPT_HASHES }).value,
    );
    expect(dev.get("script-src")).toBe(`'self' 'unsafe-inline' 'unsafe-eval' ${UMAMI_ORIGIN}`);
  });

  it("keeps inline styles allowed, since React renders style attributes", () => {
    const policy = directives(contentSecurityPolicy({ enforce: true, isDev: false }).value);
    expect(policy.get("style-src")).toBe("'self' 'unsafe-inline'");
  });

  it("allows the self-hosted Umami origin for its script and its event beacon only", () => {
    const policy = directives(contentSecurityPolicy({ enforce: true, isDev: false }).value);
    const withUmami = [...policy].filter(([, sources]) => sources.includes(UMAMI_ORIGIN));
    expect(withUmami.map(([name]) => name)).toEqual(["script-src", "connect-src"]);
  });

  it("never allows a wildcard or a scheme-wide source", () => {
    const { value } = contentSecurityPolicy({ enforce: true, isDev: false });
    expect(value).not.toMatch(/(^|\s)(\*|https:|http:|blob:)(\s|;|$)/);
  });
});

describe("securityHeaders", () => {
  it("declares each header name exactly once", () => {
    const keys = securityHeaders().map((header) => header.key.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is what next.config serves on every path", async () => {
    const routes = await nextConfig.headers?.();
    expect(routes).toEqual([{ source: "/:path*", headers: securityHeaders() }]);
  });

  it("carries no content security policy, which proxy.ts alone sends with each page's hashes", () => {
    const keys = securityHeaders().map((header) => header.key.toLowerCase());
    expect(keys.filter((key) => key.startsWith("content-security-policy"))).toEqual([]);
  });
});
