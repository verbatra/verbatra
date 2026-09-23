import { describe, expect, it, vi } from "vitest";
import {
  createGuardedFetch,
  type FetchLike,
  findNetworkPolicyViolation,
  MAX_FOLLOWED_REDIRECTS,
  NetworkPolicyViolation,
  REFUSED_RESPONSE_STATUS,
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

function guarded(send: FetchLike, lookup?: (host: string) => Promise<readonly string[]>) {
  return createGuardedFetch(
    LOCAL_ONLY,
    lookup === undefined ? { fetch: send } : { fetch: send, lookup },
  );
}

function sentUrls(send: ReturnType<typeof scripted>): string[] {
  return send.mock.calls.map(([input]) => String(input));
}

describe("createGuardedFetch: the first hop", () => {
  it("sends a permitted request with redirects switched to manual", async () => {
    const send = scripted(new Response("ok"));
    const response = await guarded(send).fetch("http://127.0.0.1:8080/v1/chat", {
      method: "POST",
      body: "{}",
    });
    expect(await response.text()).toBe("ok");
    expect(send).toHaveBeenCalledWith("http://127.0.0.1:8080/v1/chat", {
      method: "POST",
      body: "{}",
      redirect: "manual",
    });
  });

  it("throws the violation outside run, naming only the host", async () => {
    const send = scripted();
    const attempt = guarded(send, async () => ["93.184.216.34"]).fetch(
      "https://api.example.com/v2?key=secret-value",
    );
    await expect(attempt).rejects.toBeInstanceOf(NetworkPolicyViolation);
    await expect(attempt).rejects.toThrow(
      'The request to api.example.com was blocked: an address this host resolves to is not permitted by the "local-only" network policy',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("blocks a literal public address without resolving it", async () => {
    const lookup = vi.fn(async () => ["127.0.0.1"]);
    await expect(guarded(scripted(), lookup).fetch("http://8.8.8.8/")).rejects.toThrow(
      "this host is not permitted",
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it("resolves a name and blocks it when any address is public", async () => {
    const send = scripted();
    const lookup = vi.fn(async () => ["10.0.0.4", "93.184.216.34"]);
    await expect(guarded(send, lookup).fetch("http://llm.internal:8000/v1")).rejects.toThrow(
      "The request to llm.internal:8000 was blocked",
    );
    expect(lookup).toHaveBeenCalledWith("llm.internal");
    expect(send).not.toHaveBeenCalled();
  });

  it("resolves a name and sends when every address is local", async () => {
    const send = scripted(new Response("ok"));
    const lookup = async () => ["10.0.0.4", "fd00::4"];
    expect((await guarded(send, lookup).fetch(new URL("http://llm.internal/v1"))).status).toBe(200);
  });

  it.each(["x.localhost", "localhost", "localhost."])(
    "resolves %s and refuses it when it points at a public address",
    async (host) => {
      const send = scripted();
      await expect(
        guarded(send, async () => ["203.0.113.10"]).fetch(`http://${host}:8080/`),
      ).rejects.toThrow("an address this host resolves to is not permitted");
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("refuses a localhost name that resolves to a private but not loopback address", async () => {
    await expect(
      guarded(scripted(), async () => ["10.0.0.5"]).fetch("http://x.localhost/"),
    ).rejects.toBeInstanceOf(NetworkPolicyViolation);
  });

  it("sends to a localhost name whose every address is loopback", async () => {
    const send = scripted(new Response("ok"));
    const response = await guarded(send, async () => ["127.0.0.1", "::1"]).fetch(
      "http://x.localhost:8080/",
    );
    expect(response.status).toBe(200);
  });

  it("refuses a link-local address carrying a zone id", async () => {
    await expect(
      guarded(scripted(), async () => ["fe80::1%en0"]).fetch("http://llm.internal/"),
    ).rejects.toBeInstanceOf(NetworkPolicyViolation);
  });

  it("uses the system resolver by default", async () => {
    const loopback: NetworkPolicy = {
      rules: [{ source: "config", policy: "allowlist", allowedHosts: ["127.0.0.0/8", "::1"] }],
    };
    const send = scripted(new Response("ok"));
    const response = await createGuardedFetch(loopback, { fetch: send }).fetch(
      "http://localhost:1/",
    );
    expect(response.status).toBe(200);
  });

  it("reads the URL of a Request input", async () => {
    await expect(
      guarded(scripted(new Response("ok"))).fetch(new Request("http://8.8.4.4/")),
    ).rejects.toBeInstanceOf(NetworkPolicyViolation);
  });

  it("sends through the global fetch by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("global")),
    );
    try {
      const response = await createGuardedFetch(LOCAL_ONLY).fetch("http://127.0.0.1/");
      expect(await response.text()).toBe("global");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("createGuardedFetch: redirects", () => {
  it("follows a same-origin 307 and re-sends the body", async () => {
    const send = scripted(redirect(307, "/next"), new Response("done"));
    const response = await guarded(send).fetch("http://127.0.0.1:9000/start", {
      method: "POST",
      body: "x",
    });
    expect(await response.text()).toBe("done");
    expect(send).toHaveBeenLastCalledWith("http://127.0.0.1:9000/next", {
      method: "POST",
      body: "x",
      redirect: "manual",
    });
  });

  it.each([
    ["another host", "http://127.0.0.2:9000/next"],
    ["another port", "http://127.0.0.1:9001/next"],
    ["another scheme", "https://127.0.0.1:9000/next"],
    ["a public host", "https://collector.example/x"],
  ])("refuses a 308 to %s and sends nothing there", async (_, location) => {
    const send = scripted(redirect(308, location));
    const credentials = { authorization: "Bearer secret-token" };
    await expect(
      guarded(send).fetch("http://127.0.0.1:9000/start", { headers: credentials }),
    ).rejects.toThrow("a restrictive network policy follows no redirect to another origin");
    expect(sentUrls(send)).toEqual(["http://127.0.0.1:9000/start"]);
  });

  it("refuses an https to http downgrade on the same host", async () => {
    const send = scripted(redirect(307, "http://localhost/next"));
    await expect(
      guarded(send, async () => ["127.0.0.1"]).fetch("https://localhost/start"),
    ).rejects.toThrow("redirected to localhost");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([301, 302, 303])("refuses a cross-origin %i as well", async (status) => {
    const send = scripted(redirect(status, "https://8.8.8.8/"));
    await expect(guarded(send).fetch("http://127.0.0.1/")).rejects.toBeInstanceOf(
      NetworkPolicyViolation,
    );
  });

  it.each([301, 302, 303])("hands a same-origin %i back unfollowed", async (status) => {
    const send = scripted(redirect(status, "/elsewhere"));
    expect((await guarded(send).fetch("http://127.0.0.1/")).status).toBe(status);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("hands back a 307 without a location", async () => {
    const send = scripted(new Response(null, { status: 307 }));
    expect((await guarded(send).fetch("http://127.0.0.1/")).status).toBe(307);
  });

  it("never follows a redirect for a Request input", async () => {
    const send = scripted(redirect(307, "/again"));
    expect((await guarded(send).fetch(new Request("http://127.0.0.1/"))).status).toBe(307);
  });

  it(`stops after ${MAX_FOLLOWED_REDIRECTS} followed redirects`, async () => {
    const hops = Array.from({ length: MAX_FOLLOWED_REDIRECTS + 1 }, (_, index) =>
      redirect(307, `/${index + 1}`),
    );
    const send = scripted(...hops);
    expect((await guarded(send).fetch("http://127.0.0.1/0")).status).toBe(307);
    expect(send).toHaveBeenCalledTimes(MAX_FOLLOWED_REDIRECTS + 1);
  });
});

describe("createGuardedFetch: run", () => {
  it("answers a refusal inside run with a non-retriable response and rethrows the violation", async () => {
    const send = scripted();
    const { fetch, run } = guarded(send);
    let seen: Response | undefined;
    const attempt = run(async () => {
      seen = await fetch("http://8.8.8.8/");
      throw new Error("the SDK turned the response into its own error");
    });
    await expect(attempt).rejects.toBeInstanceOf(NetworkPolicyViolation);
    expect(seen?.status).toBe(REFUSED_RESPONSE_STATUS);
    expect(seen?.headers.get("x-should-retry")).toBe("false");
  });

  it("rethrows the violation even when the call itself resolved", async () => {
    const { fetch, run } = guarded(scripted());
    await expect(run(() => fetch("http://8.8.8.8/"))).rejects.toBeInstanceOf(
      NetworkPolicyViolation,
    );
  });

  it("passes a result and an unrelated error through", async () => {
    const { fetch, run } = guarded(scripted(new Response("ok")));
    expect((await run(() => fetch("http://127.0.0.1/"))).status).toBe(200);
    await expect(run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  });

  it("keeps concurrent calls apart", async () => {
    const { fetch, run } = guarded(scripted(new Response("ok")));
    const [refused, allowed] = await Promise.allSettled([
      run(() => fetch("http://8.8.8.8/")),
      run(() => fetch("http://127.0.0.1/")),
    ]);
    expect(refused.status).toBe("rejected");
    expect(allowed.status).toBe("fulfilled");
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
