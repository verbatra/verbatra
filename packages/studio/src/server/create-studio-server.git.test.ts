import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { HUMAN_ONLY_METHOD_NAMES } from "../shared/rpc/human-only.js";
import {
  authenticatedCookie,
  fixtureLoader,
  makeFixtureProject,
  withServer,
} from "./test-support.js";
import type { ExecFileImpl } from "./types.js";

interface RpcResponseBody {
  readonly ok: boolean;
  readonly error?: { readonly code: string };
  readonly result?: unknown;
}

const execFileAsync = promisify(execFileCb);

const TOKEN = "git-view-test-token-0123456789abcdef";

async function postRpc(
  url: string,
  cookie: string,
  method: string,
  params: Record<string, unknown>,
): Promise<{ status: number; body: RpcResponseBody }> {
  const response = await fetch(new URL("/rpc", url), {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: url.replace(/\/$/, ""),
    },
    body: JSON.stringify({ method, params }),
  });
  return { status: response.status, body: (await response.json()) as RpcResponseBody };
}

describe("git.status and git.localeDiff over HTTP", () => {
  it("are human-only methods, so no agent tool wraps them", () => {
    expect(HUMAN_ONLY_METHOD_NAMES).toContain("git.status");
    expect(HUMAN_ONLY_METHOD_NAMES).toContain("git.localeDiff");
  });

  it("refuses a path, an extra field and a missing locale before any handler runs", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);

          const withPath = await postRpc(server.url, cookie, "git.localeDiff", {
            locale: "de",
            path: "../x",
          });
          const pathOnly = await postRpc(server.url, cookie, "git.localeDiff", {
            path: "locales/de.json",
          });
          const longLocale = await postRpc(server.url, cookie, "git.localeDiff", {
            locale: "d".repeat(129),
          });
          const statusWithPath = await postRpc(server.url, cookie, "git.status", {
            path: "locales/de.json",
          });

          for (const refused of [withPath, pathOnly, longLocale, statusWithPath]) {
            expect(refused.status).toBe(400);
            expect(refused.body).toMatchObject({ ok: false, error: { code: "PARAMS_INVALID" } });
          }
        },
        { token: TOKEN, loader: fixtureLoader(project), cwd: project.root },
      );
    } finally {
      await project.cleanup();
    }
  });

  it("refuses a locale the project does not configure", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);

          const result = await postRpc(server.url, cookie, "git.localeDiff", { locale: "xx" });

          expect(result.body).toMatchObject({ ok: false, error: { code: "UNKNOWN_LOCALE" } });
        },
        { token: TOKEN, loader: fixtureLoader(project), cwd: project.root },
      );
    } finally {
      await project.cleanup();
    }
  });

  it("rate limits each method on its own ceiling", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const status = (): Promise<{ status: number; body: RpcResponseBody }> =>
            postRpc(server.url, cookie, "git.status", {});
          const diff = (): Promise<{ status: number; body: RpcResponseBody }> =>
            postRpc(server.url, cookie, "git.localeDiff", { locale: "de" });

          const statusCalls = [await status(), await status(), await status()];
          const diffCalls = [await diff(), await diff(), await diff(), await diff()];

          expect(statusCalls.map((call) => call.status)).toEqual([200, 200, 429]);
          expect(statusCalls[2]?.body).toMatchObject({
            ok: false,
            error: { code: "METHOD_RATE_LIMITED" },
          });
          expect(diffCalls.map((call) => call.status)).toEqual([200, 200, 200, 429]);
        },
        {
          token: TOKEN,
          loader: fixtureLoader(project),
          cwd: project.root,
          gitStatusRateLimitWindowMs: 60_000,
          gitStatusRateLimitMax: 2,
          gitLocaleDiffRateLimitWindowMs: 60_000,
          gitLocaleDiffRateLimitMax: 3,
        },
      );
    } finally {
      await project.cleanup();
    }
  });

  it("serves history.keyRevisions to an authenticated caller and rate limits it on its own ceiling", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const call = (): Promise<{ status: number; body: RpcResponseBody }> =>
            postRpc(server.url, cookie, "history.keyRevisions", { locale: "de", key: "greeting" });

          const calls = [await call(), await call(), await call()];

          expect(calls.map((entry) => entry.status)).toEqual([200, 200, 429]);
          expect(calls[0]?.body).toMatchObject({
            ok: true,
            result: { available: false, reason: "not-a-repository" },
          });
          expect(calls[2]?.body).toMatchObject({
            ok: false,
            error: { code: "METHOD_RATE_LIMITED" },
          });
        },
        {
          token: TOKEN,
          loader: fixtureLoader(project),
          cwd: project.root,
          keyRevisionsRateLimitWindowMs: 60_000,
          keyRevisionsRateLimitMax: 2,
        },
      );
    } finally {
      await project.cleanup();
    }
  });

  it("answers a project outside a repository as an unavailable result with status 200", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);

          const result = await postRpc(server.url, cookie, "git.status", {});

          expect(result.status).toBe(200);
          expect(result.body).toEqual({
            ok: true,
            result: { available: false, reason: "not-a-repository" },
          });
        },
        { token: TOKEN, loader: fixtureLoader(project), cwd: project.root },
      );
    } finally {
      await project.cleanup();
    }
  });

  it("asks git through the injected process runner when it starts", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] });
    try {
      const asked: (readonly string[])[] = [];
      const execFileImpl: ExecFileImpl = async (file, args, options) => {
        asked.push(args);
        return execFileAsync(file, [...args], options);
      };

      await withServer(async () => {}, {
        token: TOKEN,
        loader: fixtureLoader(project),
        cwd: project.root,
        execFileImpl,
        createWatcher: () => ({ onChange: () => {}, close: async () => {} }),
      });

      expect(asked.length).toBeGreaterThan(0);
    } finally {
      await project.cleanup();
    }
  });
});
