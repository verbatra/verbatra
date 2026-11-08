import { access, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SdkFs } from "@verbatra/sdk";
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
  readonly error?: { readonly code: string; readonly message?: string };
  readonly result?: unknown;
}

const TOKEN = "set-max-length-test-token-0123456789abcdef";

async function postRpc(
  url: string,
  cookie: string,
  params: unknown,
): Promise<{ status: number; body: RpcResponseBody }> {
  const response = await fetch(new URL("/rpc", url), {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: url.replace(/\/$/, ""),
    },
    body: JSON.stringify({ method: "key.setMaxLength", params }),
  });
  return { status: response.status, body: (await response.json()) as RpcResponseBody };
}

function gatedFs(gate: Promise<void>, onWrite: () => void): SdkFs {
  return {
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
    readBytesBounded: async (path) => {
      try {
        return { kind: "ok", bytes: new Uint8Array(await readFile(path)) };
      } catch {
        return { kind: "missing" };
      }
    },
    writeFile: async (path, data) => {
      onWrite();
      await gate;
      const temp = `${path}.tmp`;
      await writeFile(temp, data, "utf8");
      await rename(temp, path);
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
}

describe("key.setMaxLength over HTTP", () => {
  it("is a human-only method, so no agent tool wraps it", () => {
    expect(HUMAN_ONLY_METHOD_NAMES).toContain("key.setMaxLength");
  });

  it("sets a limit and answers the sdk result", async () => {
    const project = await makeFixtureProject();
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);

          const set = await postRpc(server.url, cookie, { key: "greeting", maxLength: 9 });

          expect(set.body).toEqual({
            ok: true,
            result: { key: "greeting", maxLength: 9, changed: true },
          });
        },
        { token: TOKEN, loader: fixtureLoader(project), cwd: project.root },
      );
    } finally {
      await project.cleanup();
    }
  });

  it.each([
    ["zero reaches the sdk", { key: "greeting", maxLength: 0 }, 200, "LENGTH_LIMIT_INVALID"],
    ["a fraction", { key: "greeting", maxLength: 1.5 }, 400, "PARAMS_INVALID"],
    ["a string", { key: "greeting", maxLength: "5" }, 400, "PARAMS_INVALID"],
    ["1e21", { key: "greeting", maxLength: 1e21 }, 400, "PARAMS_INVALID"],
    ["2^53", { key: "greeting", maxLength: 2 ** 53 }, 400, "PARAMS_INVALID"],
    ["a missing limit", { key: "greeting" }, 400, "PARAMS_INVALID"],
    ["an empty key", { key: "", maxLength: 5 }, 400, "PARAMS_INVALID"],
    ["an actor field", { key: "greeting", maxLength: 5, actor: "agent" }, 400, "PARAMS_INVALID"],
    ["a locale field", { key: "greeting", maxLength: 5, locale: "de" }, 400, "PARAMS_INVALID"],
    ["a path field", { key: "greeting", maxLength: 5, path: "/etc" }, 400, "PARAMS_INVALID"],
  ])("refuses %s", async (_name, params, status, code) => {
    const project = await makeFixtureProject();
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);

          const response = await postRpc(server.url, cookie, params);

          expect(response.status).toBe(status);
          expect(response.body).toMatchObject({ ok: false, error: { code } });
        },
        { token: TOKEN, loader: fixtureLoader(project), cwd: project.root },
      );
    } finally {
      await project.cleanup();
    }
  });

  it("refuses a key the config sets and says the config was read at start", async () => {
    const project = await makeFixtureProject({ maxLength: { greeting: 5 } });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);

          const response = await postRpc(server.url, cookie, { key: "greeting", maxLength: 9 });

          expect(response.body).toMatchObject({
            ok: false,
            error: { code: "LENGTH_LIMIT_INVALID" },
          });
          expect(response.body.error?.message).toMatch(/Studio read the config when it started/);
        },
        { token: TOKEN, loader: fixtureLoader(project), cwd: project.root },
      );
    } finally {
      await project.cleanup();
    }
  });

  it("is rate limited on its own ceiling", async () => {
    const project = await makeFixtureProject();
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const call = (): Promise<{ status: number; body: RpcResponseBody }> =>
            postRpc(server.url, cookie, { key: "greeting", maxLength: 5 });

          const statuses = [(await call()).status, (await call()).status, (await call()).status];

          expect(statuses).toEqual([200, 200, 429]);
        },
        {
          token: TOKEN,
          loader: fixtureLoader(project),
          cwd: project.root,
          setMaxLengthRateLimitWindowMs: 60_000,
          setMaxLengthRateLimitMax: 2,
        },
      );
    } finally {
      await project.cleanup();
    }
  });

  it("answers a second call ALREADY_IN_PROGRESS while the first still writes", async () => {
    const project = await makeFixtureProject();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writing: () => void = () => {};
    const writeStarted = new Promise<void>((resolve) => {
      writing = resolve;
    });
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const first = postRpc(server.url, cookie, { key: "greeting", maxLength: 5 });
          await writeStarted;

          const second = await postRpc(server.url, cookie, { key: "greeting", maxLength: 6 });
          release();

          expect(second.status).toBe(409);
          expect(second.body).toMatchObject({ ok: false, error: { code: "ALREADY_IN_PROGRESS" } });
          expect((await first).body.ok).toBe(true);
        },
        {
          token: TOKEN,
          loader: fixtureLoader(project),
          cwd: project.root,
          fs: gatedFs(gate, writing),
        },
      );
    } finally {
      release();
      await project.cleanup();
    }
  });
});
