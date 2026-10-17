import { describe, expect, it, vi } from "vitest";
import type { FetchLike, FetchResponseLike } from "./rpc-client.js";
import { createRpcClient, NETWORK_FAILURE_ERROR } from "./rpc-client.js";
import { createSessionStore } from "./state.js";

function jsonResponse(status: number, body: unknown): FetchResponseLike {
  return { status, json: () => Promise.resolve(body) };
}

describe("createRpcClient", () => {
  it("posts the method and params, and returns a successful envelope", async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse(200, { ok: true, result: { sourceLocale: "en" } })),
    );
    const client = createRpcClient({ fetchImpl, session: createSessionStore() });

    const result = await client.call("project.snapshot", {});

    expect(result).toEqual({ ok: true, result: { sourceLocale: "en" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("/rpc");
    expect(init?.method).toBe("POST");
    expect(init?.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init?.body ?? "{}")).toEqual({ method: "project.snapshot", params: {} });
  });

  it("passes a domain ok:false envelope through unchanged", async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(
        jsonResponse(200, { ok: false, error: { code: "CONFIG_NOT_FOUND", message: "x" } }),
      );
    const client = createRpcClient({ fetchImpl, session: createSessionStore() });

    const result = await client.call("project.snapshot", {});

    expect(result).toEqual({ ok: false, error: { code: "CONFIG_NOT_FOUND", message: "x" } });
  });

  it("treats an HTTP 401 as terminal session expiry: marks the session and never fetches again", async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(401, "Unauthorized")));
    const session = createSessionStore();
    const client = createRpcClient({ fetchImpl, session });

    const first = await client.call("project.snapshot", {});
    const second = await client.call("project.snapshot", {});

    expect(first.ok).toBe(false);
    expect(first).toMatchObject({ error: { code: "SESSION_EXPIRED" } });
    expect(second).toMatchObject({ error: { code: "SESSION_EXPIRED" } });
    expect(session.getState()).toEqual({ kind: "session-expired" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("short-circuits every call once the session is already expired, without ever calling fetchImpl", async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse(200, { ok: true, result: {} })),
    );
    const session = createSessionStore();
    session.markSessionExpired();
    const client = createRpcClient({ fetchImpl, session });

    const result = await client.call("project.snapshot", {});

    expect(result).toMatchObject({ error: { code: "SESSION_EXPIRED" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a structured error for a response that is not envelope-shaped", async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(jsonResponse(200, "not an envelope"));
    const client = createRpcClient({ fetchImpl, session: createSessionStore() });

    const result = await client.call("project.snapshot", {});

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "REQUEST_INVALID" } });
  });

  it("uses a custom endpoint when given", async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse(200, { ok: true, result: {} })),
    );
    const client = createRpcClient({
      fetchImpl,
      session: createSessionStore(),
      endpoint: "/custom-rpc",
    });

    await client.call("project.snapshot", {});

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/custom-rpc");
  });

  it("returns a network failure as an ordinary error result instead of throwing", async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new TypeError("Failed to fetch"));
    const client = createRpcClient({ fetchImpl, session: createSessionStore() });

    const result = await client.call("review.reject", {
      locale: "de",
      key: "greeting",
      expectedValue: "Hallo",
    });

    expect(result).toEqual({ ok: false, error: NETWORK_FAILURE_ERROR });
  });

  it("returns an unreadable reply as the same network failure", async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve({ status: 502, json: () => Promise.reject(new SyntaxError("Bad JSON")) });
    const client = createRpcClient({ fetchImpl, session: createSessionStore() });

    const result = await client.call("project.snapshot", {});

    expect(result).toMatchObject({ ok: false, error: { code: "NETWORK_ERROR" } });
  });
});
