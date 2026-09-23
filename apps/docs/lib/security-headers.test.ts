import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";
import {
  CSP_ENFORCED,
  contentSecurityPolicy,
  securityHeaders,
  UMAMI_ORIGIN,
} from "./security-headers.mjs";

const REPORT_ONLY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${UMAMI_ORIGIN}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${UMAMI_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function directives(value: string): Map<string, string> {
  return new Map(
    value.split("; ").map((directive) => {
      const [name = "", ...sources] = directive.split(" ");
      return [name, sources.join(" ")];
    }),
  );
}

describe("contentSecurityPolicy", () => {
  it("ships in report-only mode until enforcement is switched on", () => {
    expect(CSP_ENFORCED).toBe(false);
    expect(securityHeaders()).toContainEqual({
      key: "Content-Security-Policy-Report-Only",
      value: REPORT_ONLY_POLICY,
    });
  });

  it("switches the header name and upgrades insecure requests once enforced", () => {
    const header = contentSecurityPolicy({ enforce: true, isDev: false });
    expect(header.key).toBe("Content-Security-Policy");
    expect(header.value).toBe(`${REPORT_ONLY_POLICY}; upgrade-insecure-requests`);
  });

  it("allows eval only in development, where React needs it for debugging", () => {
    const dev = directives(contentSecurityPolicy({ enforce: false, isDev: true }).value);
    const prod = directives(contentSecurityPolicy({ enforce: false, isDev: false }).value);
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
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
});
