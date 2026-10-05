import { readFileSync } from "node:fs";
import type { NextFetchEvent } from "next/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { NOT_FOUND_ROUTE } from "@/lib/inline-script-hashes.mjs";

const ROUTES = {
  "/en": ["'sha256-home-en'"],
  "/de/docs/formats": ["'sha256-formats-de'"],
  "/en/docs/providers": ["'sha256-providers-en'"],
  [NOT_FOUND_ROUTE]: ["'sha256-not-found'"],
};

vi.mock("@/lib/csp-script-hashes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/csp-script-hashes")>();
  return {
    ...actual,
    scriptHashesFor: (pathname: string) => actual.scriptHashesFor(pathname, ROUTES),
  };
});

const { default: proxy } = await import("./proxy");

const event = {} as NextFetchEvent;

async function run(path: string, headers: Record<string, string> = {}): Promise<Response> {
  const response = await proxy(new NextRequest(`http://localhost${path}`, { headers }), event);
  if (!(response instanceof Response)) throw new Error(`proxy returned no response for ${path}`);
  return response;
}

function scriptSrc(response: Response): string {
  const policy = response.headers.get("content-security-policy") ?? "";
  return policy.split("; ").find((directive) => directive.startsWith("script-src ")) ?? "";
}

describe("proxy: content security policy", () => {
  it.each([
    ["/", "'sha256-home-en'"],
    ["/docs/providers", "'sha256-providers-en'"],
    ["/de/docs/formats", "'sha256-formats-de'"],
  ])("allows the inline scripts of the page that %s is served from", async (path, hash) => {
    const response = await run(path, { accept: "text/html" });
    expect(scriptSrc(response).split(" ")).toContain(hash);
  });

  it("allows the not-found page's scripts for a path that was never prerendered", async () => {
    const response = await run("/docs/missing", { accept: "text/html" });
    expect(scriptSrc(response).split(" ")).toContain("'sha256-not-found'");
  });

  it.each(["/", "/docs/providers", "/de/docs/formats.md", "/contact"])(
    "enforces a policy without unsafe-inline scripts on %s",
    async (path) => {
      const response = await run(path);
      expect(response.headers.get("content-security-policy-report-only")).toBeNull();
      expect(scriptSrc(response)).toMatch(/^script-src 'self'/);
      expect(scriptSrc(response)).not.toContain("'unsafe-inline'");
    },
  );

  it("sends one policy, so a second one cannot narrow it", async () => {
    const response = await run("/de/docs/formats");
    expect(response.headers.get("content-security-policy")?.match(/script-src/g)).toHaveLength(1);
  });
});

describe("prerendered pages only", () => {
  it.each(["app/[lang]/layout.tsx", "app/[lang]/docs/[[...slug]]/page.tsx"])(
    "%s renders no page at runtime, whose inline scripts would have no hash",
    (file) => {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).toMatch(/^export const dynamicParams = false;$/m);
    },
  );
});
