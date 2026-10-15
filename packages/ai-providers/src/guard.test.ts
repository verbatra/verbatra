import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "./errors.js";
import { guardProviderCall, PROVIDER_CALL_FAILED_MESSAGE, TIMEOUT_MESSAGE } from "./guard.js";
import {
  BASE_URL_REMEDY,
  REFUSED_REQUEST_REMEDY,
  REJECTED_REQUEST_REMEDY,
} from "./http-failure-message.js";
import { NetworkPolicyViolation } from "./network/guarded-fetch.js";

class StatusError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("upstream detail that must never surface");
    this.status = status;
  }
}

class APIConnectionTimeoutError extends Error {}

class APIUserAbortError extends Error {
  constructor() {
    super("Request was aborted.");
  }
}

class ConnectionError extends Error {
  readonly error: Error;
  constructor(cause: Error) {
    super("Connection error.");
    this.error = cause;
  }
}

describe("guardProviderCall: success", () => {
  it("returns the call's resolved value unchanged", async () => {
    await expect(guardProviderCall(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });
});

describe("guardProviderCall: classification by status code", () => {
  it("maps a 429 to RATE_LIMITED and names the status", async () => {
    const call = () => Promise.reject(new StatusError(429));
    await expect(guardProviderCall(call)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "The translation provider rate-limited this request (HTTP 429).",
    });
  });

  it("maps a 401 to AUTH_FAILED and names the status", async () => {
    const call = () => Promise.reject(new StatusError(401));
    await expect(guardProviderCall(call)).rejects.toMatchObject({
      code: "AUTH_FAILED",
      message: "The translation provider rejected the request credentials (HTTP 401).",
    });
  });

  it("maps a 403 to AUTH_FAILED with the policy remedy", async () => {
    const call = () => Promise.reject(new StatusError(403));
    await expect(guardProviderCall(call)).rejects.toMatchObject({
      code: "AUTH_FAILED",
      message: `The translation provider refused the request (HTTP 403). ${REFUSED_REQUEST_REMEDY}`,
    });
  });

  it("maps a 408 to TIMEOUT", async () => {
    const call = () => Promise.reject(new StatusError(408));
    await expect(guardProviderCall(call)).rejects.toMatchObject({
      code: "TIMEOUT",
      message: "The translation provider request timed out (HTTP 408).",
    });
  });

  it("maps a 503 to PROVIDER_UNAVAILABLE and names the status", async () => {
    const call = () => Promise.reject(new StatusError(503));
    await expect(guardProviderCall(call)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      message: "The translation provider is currently unavailable (HTTP 503).",
    });
  });

  it("falls back to PROVIDER_ERROR for an unrecognized status and names the status", async () => {
    const call = () => Promise.reject(new StatusError(400));
    await expect(guardProviderCall(call)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "The translation provider request failed (HTTP 400).",
    });
  });

  it("adds the rejected-request remedy for a 400 from a Chat Completions endpoint", async () => {
    const call = () => Promise.reject(new StatusError(400));
    await expect(
      guardProviderCall(call, undefined, {
        endpointHost: "gateway.example.test",
        remedies: "chat-completions",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: `The translation provider request to gateway.example.test failed (HTTP 400). ${REJECTED_REQUEST_REMEDY}`,
    });
  });

  it("adds the base URL remedy for a 404 from a Chat Completions endpoint", async () => {
    const call = () => Promise.reject(new StatusError(404));
    await expect(
      guardProviderCall(call, undefined, {
        endpointHost: "localhost:1234",
        remedies: "chat-completions",
      }),
    ).rejects.toMatchObject({
      message: `The translation provider request to localhost:1234 failed (HTTP 404). ${BASE_URL_REMEDY}`,
    });
  });

  it("adds no Chat Completions remedy when only the endpoint host is known", async () => {
    const call = () => Promise.reject(new StatusError(404));
    await expect(
      guardProviderCall(call, undefined, { endpointHost: "translation.googleapis.com" }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "The translation provider request to translation.googleapis.com failed (HTTP 404).",
    });
  });

  it("never relays the upstream message text", async () => {
    const call = () => Promise.reject(new StatusError(400));
    const rejection = await guardProviderCall(call).catch((error: unknown) => error);
    expect((rejection as Error).message).not.toContain("upstream detail");
  });
});

describe("guardProviderCall: classification by SDK error class", () => {
  it("maps a status-less APIConnectionTimeoutError to TIMEOUT", async () => {
    const call = () => Promise.reject(new APIConnectionTimeoutError("connect timeout"));
    await expect(guardProviderCall(call)).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("falls back to PROVIDER_ERROR for a plain, unclassified Error (never parses message text)", async () => {
    const call = () =>
      Promise.reject(new Error("401 x-api-key: sk-SECRET Authorization: Bearer sk-SECRET"));
    const rejection = await guardProviderCall(call).catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(ProviderError);
    expect((rejection as ProviderError).code).toBe("PROVIDER_ERROR");
    expect((rejection as ProviderError).message).toBe(PROVIDER_CALL_FAILED_MESSAGE);
  });
});

describe("guardProviderCall: secret-free messages", () => {
  it("never carries the raw error's message text into the thrown ProviderError", async () => {
    const call = () => Promise.reject(new StatusError(429));
    const rejection = await guardProviderCall(call).catch((error: unknown) => error);
    expect((rejection as ProviderError).message).not.toContain("upstream detail");
  });
});

describe("guardProviderCall: abort passthrough", () => {
  it("re-throws unchanged, not as a ProviderError, when the signal was already aborted before the call runs", async () => {
    const controller = new AbortController();
    controller.abort();
    const call = vi.fn(() => Promise.resolve("unreachable"));
    let caught: unknown;
    try {
      await guardProviderCall(call, controller.signal);
      expect.unreachable("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeInstanceOf(ProviderError);
    expect(call).not.toHaveBeenCalled();
  });

  it("re-throws the underlying error unchanged, not as a ProviderError, when the signal fires mid-flight", async () => {
    const controller = new AbortController();
    const sentinel = new Error("aborted by caller");
    sentinel.name = "AbortError";
    const call = () => {
      controller.abort();
      return Promise.reject(sentinel);
    };
    let caught: unknown;
    try {
      await guardProviderCall(call, controller.signal);
      expect.unreachable("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(sentinel);
  });

  it("recognizes a native AbortError even without a signal reference", async () => {
    const sentinel = new DOMException("This operation was aborted.", "AbortError");
    const call = () => Promise.reject(sentinel);
    let caught: unknown;
    try {
      await guardProviderCall(call);
      expect.unreachable("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(sentinel);
  });

  it("still classifies a non-abort error normally when a signal is passed but never aborted", async () => {
    const controller = new AbortController();
    const call = () => Promise.reject(new StatusError(429));
    await expect(guardProviderCall(call, controller.signal)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});

describe("guardProviderCall: unrelated error racing a concurrent abort (leak regression)", () => {
  it("never rethrows the raw error unredacted when the signal is aborted but the error is unrelated", async () => {
    const controller = new AbortController();
    const secretBearingCause = new Error("secret detail") as Error & {
      config: { headers: { Authorization: string } };
    };
    secretBearingCause.config = { headers: { Authorization: "DeepL-Auth-Key sk-SECRET" } };
    const raw = new ConnectionError(secretBearingCause);
    const call = () => {
      controller.abort();
      return Promise.reject(raw);
    };
    const rejection = await guardProviderCall(call, controller.signal).catch(
      (error: unknown) => error,
    );
    expect(rejection).not.toBe(raw);
    expect(rejection).toBeInstanceOf(ProviderError);
    expect((rejection as ProviderError).code).toBe("TIMEOUT");
    expect((rejection as ProviderError).message).toBe(TIMEOUT_MESSAGE);
    expect(JSON.stringify(rejection)).not.toContain("sk-SECRET");
  });

  it("never rethrows a plain unrelated Error unredacted when the signal is aborted concurrently", async () => {
    const controller = new AbortController();
    const raw = new Error("Authorization: Bearer sk-SECRET");
    const call = () => {
      controller.abort();
      return Promise.reject(raw);
    };
    const rejection = await guardProviderCall(call, controller.signal).catch(
      (error: unknown) => error,
    );
    expect(rejection).not.toBe(raw);
    expect(rejection).toBeInstanceOf(ProviderError);
    expect((rejection as ProviderError).code).toBe("PROVIDER_ERROR");
    expect((rejection as ProviderError).message).toBe(PROVIDER_CALL_FAILED_MESSAGE);
  });
});

describe("guardProviderCall: true abort per provider SDK shape", () => {
  it("openai/anthropic: rethrows APIUserAbortError unchanged (matched by class, not by .name)", async () => {
    const controller = new AbortController();
    const sentinel = new APIUserAbortError();
    expect(sentinel.name).toBe("Error");
    const call = () => {
      controller.abort();
      return Promise.reject(sentinel);
    };
    const caught = await guardProviderCall(call, controller.signal).catch(
      (error: unknown) => error,
    );
    expect(caught).toBe(sentinel);
  });

  it("gemini: rethrows the native fetch/undici AbortError DOMException unchanged", async () => {
    const controller = new AbortController();
    const sentinel = new DOMException("This operation was aborted.", "AbortError");
    const call = () => {
      controller.abort();
      return Promise.reject(sentinel);
    };
    const caught = await guardProviderCall(call, controller.signal).catch(
      (error: unknown) => error,
    );
    expect(caught).toBe(sentinel);
  });

  it("deepl: an already-aborted signal short-circuits before the call runs, since deepl-node has no in-flight cancellation and no abort-shaped error of its own", async () => {
    const controller = new AbortController();
    controller.abort();
    const call = vi.fn(() => Promise.reject(new ConnectionError(new Error("unreachable"))));
    const caught = await guardProviderCall(call, controller.signal).catch(
      (error: unknown) => error,
    );
    expect(call).not.toHaveBeenCalled();
    expect(caught).not.toBeInstanceOf(ProviderError);
  });

  it("deepl: a genuine in-flight failure racing an unrelated abort of the shared signal is still classified, never rethrown as an abort", async () => {
    const controller = new AbortController();
    const raw = new ConnectionError(new Error("axios failure"));
    const call = () => {
      controller.abort();
      return Promise.reject(raw);
    };
    const rejection = await guardProviderCall(call, controller.signal).catch(
      (error: unknown) => error,
    );
    expect(rejection).not.toBe(raw);
    expect(rejection).toBeInstanceOf(ProviderError);
    expect((rejection as ProviderError).code).toBe("TIMEOUT");
  });
});

describe("guardProviderCall: network policy", () => {
  it("surfaces a blocked request as NETWORK_POLICY_VIOLATION, keeping its message", async () => {
    const violation = new NetworkPolicyViolation("api.example.com", "The request was blocked.");
    const wrapped = new Error("Connection error.", { cause: violation });
    await expect(guardProviderCall(() => Promise.reject(wrapped))).rejects.toMatchObject({
      name: "ProviderError",
      code: "NETWORK_POLICY_VIOLATION",
      message: "The request was blocked.",
    });
  });
});
