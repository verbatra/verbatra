import { access, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SdkFs } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  authenticatedCookie,
  fixtureLoader,
  makeFixtureProject,
  stubLoader,
  withServer,
} from "./test-support.js";

interface RpcResponseBody {
  readonly ok: boolean;
  readonly error?: { readonly code: string };
  readonly result?: unknown;
}

async function postRpc(
  url: string,
  cookie: string,
  method: string,
  params: Record<string, unknown> = {},
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

const TOKEN = "capabilities-test-token-0123456789abcdef";

describe("translation.retranslateEntry reachability across the spend table", () => {
  it("returns METHOD_UNKNOWN on a default server (no spend)", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const { status, body } = await postRpc(server.url, cookie, "translation.retranslateEntry", {
          locale: "de",
          key: "greeting",
        });
        expect(status).toBe(400);
        expect(body).toMatchObject({ ok: false, error: { code: "METHOD_UNKNOWN" } });
      },
      { token: TOKEN, loader: stubLoader() },
    );
  });

  it("returns METHOD_UNKNOWN when spend is explicitly false", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const { body } = await postRpc(server.url, cookie, "translation.retranslateEntry", {
          locale: "de",
          key: "greeting",
        });
        expect(body).toMatchObject({ ok: false, error: { code: "METHOD_UNKNOWN" } });
      },
      { token: TOKEN, loader: stubLoader(), spend: false },
    );
  });

  it("reaches the real handler (not METHOD_UNKNOWN) with spend set, no other flag needed", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const { body } = await postRpc(server.url, cookie, "translation.retranslateEntry", {
          locale: "de",
          key: "greeting",
        });
        expect(body.ok).toBe(false);
        expect(body.error?.code).not.toBe("METHOD_UNKNOWN");
      },
      { token: TOKEN, loader: stubLoader(), spend: true },
    );
  });

  it("the params schema still validates a malformed body regardless of capability state", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const { body } = await postRpc(server.url, cookie, "translation.retranslateEntry", {
          locale: "",
          key: "greeting",
        });
        expect(body).toMatchObject({ ok: false, error: { code: "PARAMS_INVALID" } });
      },
      { token: TOKEN, loader: stubLoader(), spend: true },
    );
  });
});

describe("project.snapshot's capabilities projection reflects the resolved flags", () => {
  it("reports spend false and writeToDisk true by default", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const { body } = await postRpc(server.url, cookie, "project.snapshot");
        expect(body).toMatchObject({
          ok: true,
          result: { capabilities: { spend: false, writeToDisk: true } },
        });
      },
      { token: TOKEN, loader: stubLoader() },
    );
  });

  it("reports both true when spend is set", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const { body } = await postRpc(server.url, cookie, "project.snapshot");
        expect(body).toMatchObject({
          ok: true,
          result: { capabilities: { spend: true, writeToDisk: true } },
        });
      },
      { token: TOKEN, loader: stubLoader(), spend: true },
    );
  });
});

describe("translation.editEntry and key.value reachability on a default server", () => {
  it("reaches the real handlers (not METHOD_UNKNOWN) on a default server, no flag needed", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const edit = await postRpc(server.url, cookie, "translation.editEntry", {
          locale: "de",
          key: "greeting",
          value: "Hallo",
        });
        const value = await postRpc(server.url, cookie, "key.value", {
          locale: "de",
          key: "greeting",
        });
        expect(edit.body.ok).toBe(false);
        expect(edit.body.error?.code).not.toBe("METHOD_UNKNOWN");
        expect(value.body.ok).toBe(false);
        expect(value.body.error?.code).not.toBe("METHOD_UNKNOWN");
      },
      { token: TOKEN, loader: stubLoader() },
    );
  });

  it("reaches the real handlers with spend also set", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const edit = await postRpc(server.url, cookie, "translation.editEntry", {
          locale: "de",
          key: "greeting",
          value: "Hallo",
        });
        expect(edit.body.error?.code).not.toBe("METHOD_UNKNOWN");
      },
      { token: TOKEN, loader: stubLoader(), spend: true },
    );
  });
});

describe("translation.editEntry is reachable on a default server, no flag at all", () => {
  it("completes a real edit end to end against a fixture project with no capability option set", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const result = await postRpc(server.url, cookie, "translation.editEntry", {
            locale: "de",
            key: "greeting",
            value: "Hallo",
          });
          expect(result.status).toBe(200);
          expect(result.body).toMatchObject({
            ok: true,
            result: { accepted: true, value: "Hallo" },
          });
        },
        {
          token: TOKEN,
          loader: fixtureLoader(project),
          cwd: project.root,
        },
      );
    } finally {
      await project.cleanup();
    }
  });
});

describe("translation.editEntry's dispatch-layer rate limit, wired end to end", () => {
  it("trips after the configured ceiling and a call under the limit is unaffected", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const first = await postRpc(server.url, cookie, "translation.editEntry", {
          locale: "de",
          key: "greeting",
          value: "Hallo",
        });
        expect(first.body.error?.code).not.toBe("METHOD_RATE_LIMITED");

        const second = await postRpc(server.url, cookie, "translation.editEntry", {
          locale: "de",
          key: "greeting",
          value: "Hallo",
        });
        expect(second.body.error?.code).not.toBe("METHOD_RATE_LIMITED");

        const third = await postRpc(server.url, cookie, "translation.editEntry", {
          locale: "de",
          key: "greeting",
          value: "Hallo",
        });
        expect(third.status).toBe(429);
        expect(third.body).toMatchObject({ ok: false, error: { code: "METHOD_RATE_LIMITED" } });
      },
      {
        token: TOKEN,
        loader: stubLoader(),
        editEntryRateLimitWindowMs: 60_000,
        editEntryRateLimitMax: 2,
      },
    );
  });
});

describe("translation.retranslateEntry's dispatch-layer rate limit, wired end to end", () => {
  it("trips after the configured ceiling and a call under the limit is unaffected", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const first = await postRpc(server.url, cookie, "translation.retranslateEntry", {
          locale: "de",
          key: "greeting",
        });
        expect(first.body.error?.code).not.toBe("METHOD_RATE_LIMITED");

        const second = await postRpc(server.url, cookie, "translation.retranslateEntry", {
          locale: "de",
          key: "greeting",
        });
        expect(second.body.error?.code).not.toBe("METHOD_RATE_LIMITED");

        const third = await postRpc(server.url, cookie, "translation.retranslateEntry", {
          locale: "de",
          key: "greeting",
        });
        expect(third.status).toBe(429);
        expect(third.body).toMatchObject({ ok: false, error: { code: "METHOD_RATE_LIMITED" } });
      },
      {
        token: TOKEN,
        loader: stubLoader(),
        spend: true,
        retranslateRateLimitWindowMs: 60_000,
        retranslateRateLimitMax: 2,
      },
    );
  });
});

describe("translation.translatePending reachability across the spend table", () => {
  it("returns METHOD_UNKNOWN on a default server (no spend)", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const { status, body } = await postRpc(server.url, cookie, "translation.translatePending");
        expect(status).toBe(400);
        expect(body).toMatchObject({ ok: false, error: { code: "METHOD_UNKNOWN" } });
      },
      { token: TOKEN, loader: stubLoader() },
    );
  });

  it("returns METHOD_UNKNOWN when spend is explicitly false", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const { body } = await postRpc(server.url, cookie, "translation.translatePending");
        expect(body).toMatchObject({ ok: false, error: { code: "METHOD_UNKNOWN" } });
      },
      { token: TOKEN, loader: stubLoader(), spend: false },
    );
  });

  it("reaches the real handler (not METHOD_UNKNOWN) with spend set, no other flag needed", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const { body } = await postRpc(server.url, cookie, "translation.translatePending");
        expect(body.ok).toBe(false);
        expect(body.error?.code).not.toBe("METHOD_UNKNOWN");
      },
      { token: TOKEN, loader: stubLoader(), spend: true },
    );
  });

  it("the params schema still rejects an unexpected key regardless of capability state", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const { body } = await postRpc(server.url, cookie, "translation.translatePending", {
          locale: "de",
        });
        expect(body).toMatchObject({ ok: false, error: { code: "PARAMS_INVALID" } });
      },
      { token: TOKEN, loader: stubLoader(), spend: true },
    );
  });

  it("the params schema still rejects an unexpected key even without the spend capability", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const { body } = await postRpc(server.url, cookie, "translation.translatePending", {
          locale: "de",
        });
        expect(body).toMatchObject({ ok: false, error: { code: "PARAMS_INVALID" } });
      },
      { token: TOKEN, loader: stubLoader() },
    );
  });
});

describe("translation.translatePending completes a real run end to end", () => {
  it("translates every configured target locale against a real fixture project", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const result = await postRpc(server.url, cookie, "translation.translatePending");
          expect(result.status).toBe(200);
          expect(result.body).toMatchObject({ ok: true, result: { succeeded: ["de"] } });
        },
        {
          token: TOKEN,
          loader: fixtureLoader(project),
          cwd: project.root,
          spend: true,
          createProvider: () => ({
            id: "stub",
            kind: "llm",
            supportsGlossary: true,
            translateBatch: async (request) => ({
              values: new Map(request.entries.map((entry) => [entry.key, "Hallo"])),
              integrity: new Map(),
            }),
          }),
        },
      );
    } finally {
      await project.cleanup();
    }
  });
});

describe("translation.translatePending's dispatch-layer rate limit, wired end to end", () => {
  it("trips after the configured ceiling and a call under the limit is unaffected", async () => {
    await withServer(
      async (server) => {
        const cookie = await authenticatedCookie(server.url, TOKEN);
        const first = await postRpc(server.url, cookie, "translation.translatePending");
        expect(first.body.error?.code).not.toBe("METHOD_RATE_LIMITED");

        const second = await postRpc(server.url, cookie, "translation.translatePending");
        expect(second.body.error?.code).not.toBe("METHOD_RATE_LIMITED");

        const third = await postRpc(server.url, cookie, "translation.translatePending");
        expect(third.status).toBe(429);
        expect(third.body).toMatchObject({ ok: false, error: { code: "METHOD_RATE_LIMITED" } });
      },
      {
        token: TOKEN,
        loader: stubLoader(),
        spend: true,
        translatePendingRateLimitWindowMs: 60_000,
        translatePendingRateLimitMax: 2,
      },
    );
  });
});

function deferred<T>(): { readonly promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitUntil(hasArrived: () => boolean): Promise<void> {
  while (!hasArrived()) {
    await sleep(5);
  }
}

describe("translation.translatePending's process-wide in-flight guard, wired end to end", () => {
  it("rejects a second overlapping call with ALREADY_IN_PROGRESS before the sdk seam runs, without blocking it on the first call's real lock, and a later call after the first settles proceeds normally", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const gate = deferred<void>();
      let providerCalls = 0;

      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);

          const firstCall = postRpc(server.url, cookie, "translation.translatePending");

          await waitUntil(() => providerCalls > 0);

          const second = await postRpc(server.url, cookie, "translation.translatePending");
          expect(second.status).toBe(409);
          expect(second.body).toMatchObject({ ok: false, error: { code: "ALREADY_IN_PROGRESS" } });
          expect(providerCalls).toBe(1);

          gate.resolve();
          const first = await firstCall;
          expect(first.body.error?.code).not.toBe("ALREADY_IN_PROGRESS");

          const third = await postRpc(server.url, cookie, "translation.translatePending");
          expect(third.body.error?.code).not.toBe("ALREADY_IN_PROGRESS");
        },
        {
          token: TOKEN,
          loader: fixtureLoader(project),
          cwd: project.root,
          spend: true,
          createProvider: () => ({
            id: "stub",
            kind: "llm",
            supportsGlossary: true,
            translateBatch: async (request) => {
              providerCalls += 1;
              await gate.promise;
              return {
                values: new Map(request.entries.map((entry) => [entry.key, "Hallo"])),
                integrity: new Map(),
              };
            },
          }),
        },
      );
    } finally {
      await project.cleanup();
    }
  });
});

describe("translation.retranslateEntry's per-(locale,key) in-flight guard, wired end to end", () => {
  it("rejects a second overlapping call for the SAME locale and key with ALREADY_IN_PROGRESS, calling the provider only once, while a concurrent call for a DIFFERENT key proceeds unaffected", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      {
        greeting: "hello",
        farewell: "bye",
      },
    );
    try {
      const gate = deferred<void>();
      let providerCalls = 0;

      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);

          const firstCall = postRpc(server.url, cookie, "translation.retranslateEntry", {
            locale: "de",
            key: "greeting",
          });

          await waitUntil(() => providerCalls > 0);

          const sameKeyCall = await postRpc(server.url, cookie, "translation.retranslateEntry", {
            locale: "de",
            key: "greeting",
          });
          expect(sameKeyCall.status).toBe(409);
          expect(sameKeyCall.body).toMatchObject({
            ok: false,
            error: { code: "ALREADY_IN_PROGRESS" },
          });
          expect(providerCalls).toBe(1);

          const differentKeyCall = postRpc(server.url, cookie, "translation.retranslateEntry", {
            locale: "de",
            key: "farewell",
          });

          gate.resolve();
          const first = await firstCall;
          expect(first.body.error?.code).not.toBe("ALREADY_IN_PROGRESS");
          const different = await differentKeyCall;
          expect(different.body.error?.code).not.toBe("ALREADY_IN_PROGRESS");
          expect(providerCalls).toBe(2);

          const later = await postRpc(server.url, cookie, "translation.retranslateEntry", {
            locale: "de",
            key: "greeting",
          });
          expect(later.body.error?.code).not.toBe("ALREADY_IN_PROGRESS");
        },
        {
          token: TOKEN,
          loader: fixtureLoader(project),
          cwd: project.root,
          spend: true,
          createProvider: () => ({
            id: "stub",
            kind: "llm",
            supportsGlossary: true,
            translateBatch: async (request) => {
              providerCalls += 1;
              await gate.promise;
              return {
                values: new Map(request.entries.map((entry) => [entry.key, "Hallo"])),
                integrity: new Map(),
              };
            },
          }),
        },
      );
    } finally {
      await project.cleanup();
    }
  });
});

const realFs: SdkFs = {
  fileExists: async (path) => {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  readFileBounded: async (path) => {
    try {
      return { kind: "ok", content: await readFile(path, "utf8") };
    } catch {
      return { kind: "missing" };
    }
  },
  readBytesBounded: async () => ({ kind: "missing" }),
  writeFile: async (path, data) => {
    await writeFile(path, data, "utf8");
  },
  writeBytes: async () => {},
  createExclusive: async (path, data) => {
    await mkdir(dirname(path), { recursive: true });
    try {
      const handle = await open(path, "wx");
      try {
        await handle.writeFile(data, "utf8");
      } finally {
        await handle.close();
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return false;
      }
      throw error;
    }
  },
  deleteFile: async (path) => {
    await rm(path, { force: true });
  },
};

function delayedWriteFs(targetPath: string, gate: Promise<void>, onWrite: () => void): SdkFs {
  return {
    ...realFs,
    writeFile: async (path, data) => {
      if (path === targetPath) {
        onWrite();
        await gate;
      }
      await realFs.writeFile(path, data);
    },
  };
}

describe("translation.editEntry's per-(locale,key) in-flight guard, wired end to end", () => {
  it("rejects a second overlapping call for the SAME locale and key with ALREADY_IN_PROGRESS, writing to disk only once, while a concurrent call for a DIFFERENT key proceeds unaffected", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      {
        greeting: "hello",
        farewell: "bye",
      },
    );
    try {
      const gate = deferred<void>();
      let writeCalls = 0;
      const targetPath = join(project.root, "locales", "de.json");
      const fs = delayedWriteFs(targetPath, gate.promise, () => {
        writeCalls += 1;
      });

      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);

          const firstCall = postRpc(server.url, cookie, "translation.editEntry", {
            locale: "de",
            key: "greeting",
            value: "Hallo",
          });

          await waitUntil(() => writeCalls > 0);

          const sameKeyCall = await postRpc(server.url, cookie, "translation.editEntry", {
            locale: "de",
            key: "greeting",
            value: "Hallo again",
          });
          expect(sameKeyCall.status).toBe(409);
          expect(sameKeyCall.body).toMatchObject({
            ok: false,
            error: { code: "ALREADY_IN_PROGRESS" },
          });
          expect(writeCalls).toBe(1);

          const differentKeyCall = postRpc(server.url, cookie, "translation.editEntry", {
            locale: "de",
            key: "farewell",
            value: "Tschuess",
          });

          gate.resolve();
          const first = await firstCall;
          expect(first.body.error?.code).not.toBe("ALREADY_IN_PROGRESS");
          const different = await differentKeyCall;
          expect(different.body.error?.code).not.toBe("ALREADY_IN_PROGRESS");
          expect(writeCalls).toBe(2);

          const later = await postRpc(server.url, cookie, "translation.editEntry", {
            locale: "de",
            key: "greeting",
            value: "Hallo once more",
          });
          expect(later.body.error?.code).not.toBe("ALREADY_IN_PROGRESS");
        },
        {
          token: TOKEN,
          loader: fixtureLoader(project),
          cwd: project.root,
          fs,
        },
      );
    } finally {
      await project.cleanup();
    }
  });
});
