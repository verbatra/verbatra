import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BODY_CAP_BYTES } from "./body-reader.js";
import { buildInFlightGuard } from "./create-studio-server.js";
import type { HandlersRegistry, RpcHandlerDeps } from "./rpc.js";
import { dispatchRpc } from "./rpc-gate.js";
import {
  authenticatedCookie,
  fixtureLoader,
  makeFixtureProject,
  withServer,
} from "./test-support.js";

const TOKEN = "value-replace-gate-token-0123456789abcdef";

function manyEntries(count: number): readonly object[] {
  return Array.from({ length: count }, (_, index) => ({
    locale: "de",
    key: `section.subsection.entry_${String(index).padStart(6, "0")}.label`,
    valueHash: "0123456789abcdef",
  }));
}

function applyBody(entries: readonly object[], extra: object = {}): string {
  return JSON.stringify({
    method: "translation.applyValueReplace",
    params: { find: "Welt", replace: "Erde", entries, ...extra },
  });
}

async function post(
  url: string,
  cookie: string,
  body: string,
): Promise<{ status: number; body: { ok: boolean; error?: { code: string }; result?: unknown } }> {
  const response = await fetch(new URL("/rpc", url), {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: url.replace(/\/$/, ""),
    },
    body,
  });
  return { status: response.status, body: (await response.json()) as never };
}

describe("applyValueReplace weight and body size", () => {
  it("fits a 1,000-entry request under the 1 MiB body cap", () => {
    expect(Buffer.byteLength(applyBody(manyEntries(1000)))).toBeLessThan(BODY_CAP_BYTES);
  });

  it("counts a 1,000-entry apply as one call: it passes a limit of one, then the next call is limited", async () => {
    const project = await makeFixtureProject();
    try {
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const first = await post(server.url, cookie, applyBody(manyEntries(1000)));
          const second = await post(server.url, cookie, applyBody(manyEntries(1000)));

          expect(first.status).toBe(200);
          expect(first.body.ok).toBe(true);
          expect(second.status).toBe(429);
          expect(second.body.error?.code).toBe("METHOD_RATE_LIMITED");
        },
        {
          loader: fixtureLoader(project),
          token: TOKEN,
          cwd: project.root,
          applyValueReplaceRateLimitMax: 1,
        },
      );
    } finally {
      await project.cleanup();
    }
  });

  it("counts a preview as one call against its own limit", async () => {
    const project = await makeFixtureProject();
    try {
      await writeFile(
        join(project.root, "locales", "de.json"),
        JSON.stringify({ greeting: "hello" }),
      );
      await withServer(
        async (server) => {
          const cookie = await authenticatedCookie(server.url, TOKEN);
          const body = JSON.stringify({
            method: "translation.previewValueReplace",
            params: { find: "hello", replace: "x" },
          });
          const first = await post(server.url, cookie, body);
          const second = await post(server.url, cookie, body);

          expect(first.body.ok).toBe(true);
          expect(second.status).toBe(429);
        },
        {
          loader: fixtureLoader(project),
          token: TOKEN,
          cwd: project.root,
          previewValueReplaceRateLimitMax: 1,
        },
      );
    } finally {
      await project.cleanup();
    }
  });
});

function stubDeps(): RpcHandlerDeps {
  return {
    config: {
      config: {
        sourceLocale: "en",
        targetLocales: ["de"],
        format: "i18next-json",
        files: { pattern: "locales/{locale}.json" },
        provider: { id: "anthropic", options: { model: "m", maxTokens: 1 } },
      },
      source: { kind: "override" },
      glossary: { source: "none" },
    },
    projectRoot: "/project",
  };
}

function gatedHandlers(release: Promise<void>, onCall: () => void): HandlersRegistry {
  const slow = async (): Promise<never> => {
    onCall();
    await release;
    return { outcomes: [], counts: {}, localeFailures: [] } as never;
  };
  return {
    "translation.applyValueReplace": slow,
    "translation.retranslateEntries": slow,
  } as unknown as HandlersRegistry;
}

function retranslateBody(entries: readonly object[]): Buffer {
  return Buffer.from(
    JSON.stringify({ method: "translation.retranslateEntries", params: { entries } }),
  );
}

describe("applyValueReplace in-flight guard", () => {
  it("answers 409 to an apply that starts while another apply is running", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const guard = buildInFlightGuard();
    const handlers = gatedHandlers(gate, () => {});
    const first = dispatchRpc(
      Buffer.from(applyBody(manyEntries(2))),
      stubDeps(),
      handlers,
      undefined,
      guard,
    );
    await vi.waitFor(() => expect(guard.entries()).toHaveLength(2));

    const second = await dispatchRpc(
      Buffer.from(applyBody(manyEntries(2))),
      stubDeps(),
      handlers,
      undefined,
      guard,
    );
    release();
    await first;

    expect(second.statusCode).toBe(409);
    expect(second.body).toContain("ALREADY_IN_PROGRESS");
    expect(guard.entries()).toHaveLength(0);
  });

  it("lists one {locale, key} entry per applied value while running", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const guard = buildInFlightGuard();
    const running = dispatchRpc(
      Buffer.from(applyBody(manyEntries(3))),
      stubDeps(),
      gatedHandlers(gate, () => {}),
      undefined,
      guard,
    );
    await vi.waitFor(() => expect(guard.entries()).toHaveLength(3));

    expect(guard.entries().map((entry) => entry.method)).toEqual([
      "translation.applyValueReplace",
      "translation.applyValueReplace",
      "translation.applyValueReplace",
    ]);
    release();
    await running;
  });

  it("answers 409 to a retranslate batch that overlaps a key an apply is changing", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const guard = buildInFlightGuard();
    const handlers = gatedHandlers(gate, () => {});
    const entries = manyEntries(2);
    const running = dispatchRpc(
      Buffer.from(applyBody(entries)),
      stubDeps(),
      handlers,
      undefined,
      guard,
    );
    await vi.waitFor(() => expect(guard.entries()).toHaveLength(2));

    const overlapping = await dispatchRpc(
      retranslateBody(entries.map((entry) => ({ ...entry, valueHash: undefined }))),
      stubDeps(),
      handlers,
      undefined,
      guard,
    );
    release();
    await running;

    expect(overlapping.statusCode).toBe(409);
  });
});

describe("applyValueReplace actor", () => {
  it("refuses a client-sent actor field before any handler runs", async () => {
    const handler = vi.fn();
    const result = await dispatchRpc(
      Buffer.from(applyBody(manyEntries(1), { actor: "agent" })),
      stubDeps(),
      { "translation.applyValueReplace": handler } as unknown as HandlersRegistry,
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toContain("PARAMS_INVALID");
    expect(handler).not.toHaveBeenCalled();
  });
});
