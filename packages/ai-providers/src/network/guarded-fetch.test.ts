import { describe, expect, it, vi } from "vitest";
import {
  createGuardedFetch,
  type FetchLike,
  findNetworkPolicyViolation,
  MAX_FOLLOWED_REDIRECTS,
  NetworkPolicyViolation,
} from "./guarded-fetch.js";
import type { NetworkPolicy } from "./policy.js";

const LOCAL_ONLY: NetworkPolicy = {
  rules: [{ source: "config", policy: "local-only", allowedHosts: [] }],
};

function redirect(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
}

function scripted(...responses: Response[]) {
  const queue = [...responses];
  return vi.fn<FetchLike>(async () => {
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("unexpected extra request");
    }
    return next;
  });
}

describe("createGuardedFetch: the first hop", () => {
  it("sends a permitted request with redirects switched to manual", async () => {
    const send = scripted(new Response("ok"));
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: send });
    const response = await guarded("http://127.0.0.1:8080/v1/chat", { method: "POST", body: "{}" });
    expect(await response.text()).toBe("ok");
    expect(send).toHaveBeenCalledWith("http://127.0.0.1:8080/v1/chat", {
      method: "POST",
      body: "{}",
      redirect: "manual",
    });
  });

  it("blocks a refused host before anything is sent, naming only the host", async () => {
    const send = scripted();
    const lookup = vi.fn(async () => ["93.184.216.34"]);
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: send, lookup });
    const attempt = guarded("https://api.example.com/v2?key=secret-value");
    await expect(attempt).rejects.toBeInstanceOf(NetworkPolicyViolation);
    await expect(attempt).rejects.toThrow(
      'The request to api.example.com was blocked: an address this host resolves to is not permitted by the "local-only" network policy',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("blocks a literal public address without resolving it", async () => {
    const lookup = vi.fn(async () => ["127.0.0.1"]);
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: scripted(), lookup });
    await expect(guarded("http://8.8.8.8/")).rejects.toThrow("this host is not permitted");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("resolves a name and blocks it when any address is public", async () => {
    const send = scripted();
    const lookup = vi.fn(async () => ["10.0.0.4", "93.184.216.34"]);
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: send, lookup });
    await expect(guarded("http://llm.internal:8000/v1")).rejects.toThrow(
      "The request to llm.internal:8000 was blocked",
    );
    expect(lookup).toHaveBeenCalledWith("llm.internal");
    expect(send).not.toHaveBeenCalled();
  });

  it("resolves a name and sends when every address is local", async () => {
    const send = scripted(new Response("ok"));
    const lookup = vi.fn(async () => ["10.0.0.4", "fd00::4"]);
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: send, lookup });
    expect((await guarded(new URL("http://llm.internal/v1"))).status).toBe(200);
  });

  it("uses the system resolver by default", async () => {
    const loopback: NetworkPolicy = {
      rules: [{ source: "config", policy: "allowlist", allowedHosts: ["127.0.0.0/8", "::1"] }],
    };
    const send = scripted(new Response("ok"));
    const guarded = createGuardedFetch(loopback, { fetch: send });
    expect((await guarded("http://localhost:1/")).status).toBe(200);
  });

  it("reads the URL of a Request input", async () => {
    const send = scripted(new Response("ok"));
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: send });
    await expect(guarded(new Request("http://8.8.4.4/"))).rejects.toBeInstanceOf(
      NetworkPolicyViolation,
    );
  });
});

describe("createGuardedFetch: redirects", () => {
  it("follows a 307 to a permitted host and re-checks it", async () => {
    const send = scripted(redirect(307, "http://127.0.0.2:9000/next"), new Response("done"));
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: send });
    const response = await guarded("http://127.0.0.1/start", { method: "POST", body: "x" });
    expect(await response.text()).toBe("done");
    expect(send).toHaveBeenLastCalledWith("http://127.0.0.2:9000/next", {
      method: "POST",
      body: "x",
      redirect: "manual",
    });
  });

  it("blocks a 308 that points at a public host", async () => {
    const send = scripted(redirect(308, "https://evil.example/collect"));
    const lookup = vi.fn(async () => ["203.0.113.9"]);
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: send, lookup });
    await expect(guarded("http://localhost/start")).rejects.toThrow(
      "The request to evil.example was blocked",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("resolves a relative location against the current URL", async () => {
    const send = scripted(redirect(307, "/v2"), new Response("ok"));
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: send });
    await guarded("http://127.0.0.1:8080/v1");
    expect(send).toHaveBeenLastCalledWith("http://127.0.0.1:8080/v2", { redirect: "manual" });
  });

  it.each([301, 302, 303])("hands a %i back unfollowed", async (status) => {
    const send = scripted(redirect(status, "https://8.8.8.8/"));
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: send });
    expect((await guarded("http://127.0.0.1/")).status).toBe(status);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("hands back a 307 without a location", async () => {
    const send = scripted(new Response(null, { status: 307 }));
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: send });
    expect((await guarded("http://127.0.0.1/")).status).toBe(307);
  });

  it("never follows a redirect for a Request input", async () => {
    const send = scripted(redirect(307, "http://127.0.0.2/"));
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: send });
    expect((await guarded(new Request("http://127.0.0.1/"))).status).toBe(307);
  });

  it(`stops after ${MAX_FOLLOWED_REDIRECTS} followed redirects`, async () => {
    const hops = Array.from({ length: MAX_FOLLOWED_REDIRECTS + 1 }, (_, index) =>
      redirect(307, `http://127.0.0.1/${index + 1}`),
    );
    const send = scripted(...hops);
    const guarded = createGuardedFetch(LOCAL_ONLY, { fetch: send });
    expect((await guarded("http://127.0.0.1/0")).status).toBe(307);
    expect(send).toHaveBeenCalledTimes(MAX_FOLLOWED_REDIRECTS + 1);
  });

  it("sends through the global fetch by default", async () => {
    const globalFetch = vi.fn(async () => new Response("global"));
    vi.stubGlobal("fetch", globalFetch);
    try {
      const response = await createGuardedFetch(LOCAL_ONLY)("http://127.0.0.1/");
      expect(await response.text()).toBe("global");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("findNetworkPolicyViolation", () => {
  const violation = new NetworkPolicyViolation("h", "blocked");

  it("finds a violation through an SDK's cause chain", () => {
    const wrapped = new Error("Connection error.", {
      cause: new Error("fetch failed", { cause: violation }),
    });
    expect(findNetworkPolicyViolation(wrapped)).toBe(violation);
    expect(findNetworkPolicyViolation(violation)).toBe(violation);
  });

  it("returns undefined for anything else", () => {
    expect(findNetworkPolicyViolation(new Error("x"))).toBeUndefined();
    expect(findNetworkPolicyViolation("x")).toBeUndefined();
    expect(findNetworkPolicyViolation(null)).toBeUndefined();
  });
});
