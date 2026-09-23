import { describe, expect, it } from "vitest";
import {
  authenticatedCookie,
  fixtureLoader,
  makeFixtureProject,
  withServer,
} from "./test-support.js";

const TOKEN = "cwd-override-test-token-0123456789abcdef";

async function postRpc(url: string, cookie: string, method: string): Promise<Response> {
  return fetch(new URL("/rpc", url), {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: url.replace(/\/$/, ""),
    },
    body: JSON.stringify({ method, params: {} }),
  });
}

interface RpcEnvelope {
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
}

describe("startStudioServer: cwd option", () => {
  it("resolves a disk-reading RPC handler against the given cwd, not the server process's own cwd", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const response = await postRpc(server.url, cookie, "status.check");
          const body = (await response.json()) as RpcEnvelope;

          expect(body.ok).toBe(true);
          expect(body.result).toEqual({
            inSync: false,
            locales: [{ locale: "de", missing: 1, stale: 0, upToDate: 0, inSync: false }],
          });
        },
        { token: TOKEN, loader: fixtureLoader(project), cwd: project.root },
      );
    } finally {
      await project.cleanup();
    }
  });

  it("falls back to the process's own cwd when the option is omitted", async () => {
    const response = await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        return postRpc(server.url, cookie, "status.check");
      },
      { token: TOKEN },
    );
    const body = (await response.json()) as RpcEnvelope;

    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("SOURCE_UNREADABLE");
  });
});
