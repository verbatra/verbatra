import { describe, expect, it } from "vitest";
import { HUMAN_ONLY_METHOD_NAMES } from "../shared/rpc/human-only.js";
import {
  authenticatedCookie,
  fixtureLoader,
  makeFixtureProject,
  withServer,
} from "./test-support.js";

interface RpcResponseBody {
  readonly ok: boolean;
  readonly error?: { readonly code: string };
  readonly result?: unknown;
}

const TOKEN = "preview-icu-test-token-0123456789abcdef";

async function postRpc(
  url: string,
  cookie: string,
  params: Record<string, unknown>,
): Promise<{ status: number; body: RpcResponseBody }> {
  const response = await fetch(new URL("/rpc", url), {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: url.replace(/\/$/, ""),
    },
    body: JSON.stringify({ method: "key.previewIcu", params }),
  });
  return { status: response.status, body: (await response.json()) as RpcResponseBody };
}

describe("key.previewIcu over HTTP", () => {
  it("is a human-only method, so no agent tool wraps it", () => {
    expect(HUMAN_ONLY_METHOD_NAMES).toContain("key.previewIcu");
  });

  it("answers a configured locale and refuses an unconfigured one without a server error", async () => {
    const project = await makeFixtureProject({ format: "next-intl-json" });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);

          const ok = await postRpc(server.url, cookie, { locale: "de", value: "Hi {name}" });
          const unknown = await postRpc(server.url, cookie, { locale: "xx", value: "Hi" });

          expect(ok.body).toMatchObject({ ok: true, result: { supported: true, valid: true } });
          expect(unknown.body).toMatchObject({ ok: false, error: { code: "UNKNOWN_LOCALE" } });
        },
        { token: TOKEN, loader: fixtureLoader(project) },
      );
    } finally {
      await project.cleanup();
    }
  });

  it("refuses a value over the cap before any handler runs", async () => {
    const project = await makeFixtureProject({ format: "next-intl-json" });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);

          const result = await postRpc(server.url, cookie, {
            locale: "de",
            value: "x".repeat(20_001),
          });

          expect(result.status).toBe(400);
          expect(result.body).toMatchObject({ ok: false, error: { code: "PARAMS_INVALID" } });
        },
        { token: TOKEN, loader: fixtureLoader(project) },
      );
    } finally {
      await project.cleanup();
    }
  });

  it("is rate limited on its own ceiling", async () => {
    const project = await makeFixtureProject({ format: "next-intl-json" });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const call = (): Promise<{ status: number; body: RpcResponseBody }> =>
            postRpc(server.url, cookie, { locale: "de", value: "Hi" });

          const first = await call();
          const second = await call();
          const third = await call();

          expect(first.status).toBe(200);
          expect(second.status).toBe(200);
          expect(third.status).toBe(429);
          expect(third.body).toMatchObject({ ok: false, error: { code: "METHOD_RATE_LIMITED" } });
        },
        {
          token: TOKEN,
          loader: fixtureLoader(project),
          previewIcuRateLimitWindowMs: 60_000,
          previewIcuRateLimitMax: 2,
        },
      );
    } finally {
      await project.cleanup();
    }
  });
});
