import { describe, expect, it } from "vitest";
import { ProviderError } from "./errors.js";
import { guardProviderCall, PROVIDER_CALL_FAILED_MESSAGE } from "./guard.js";

function connectionError(code: string): Error {
  return Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error(`connect ${code} 127.0.0.1:11434`), { code }),
  });
}

async function failWith(error: unknown, endpointHost?: string): Promise<ProviderError> {
  const caught = await guardProviderCall(
    () => Promise.reject(error),
    undefined,
    endpointHost === undefined ? undefined : { endpointHost },
  ).catch((thrown: unknown) => thrown);
  expect(caught).toBeInstanceOf(ProviderError);
  return caught as ProviderError;
}

describe("an unreachable provider endpoint", () => {
  it("still classifies a refused connection as PROVIDER_ERROR", async () => {
    const error = await failWith(connectionError("ECONNREFUSED"), "localhost:11434");

    expect(error.code).toBe("PROVIDER_ERROR");
  });

  it("names the connection refusal rather than saying only that the request failed", async () => {
    const error = await failWith(connectionError("ECONNREFUSED"), "localhost:11434");

    expect(error.message).toContain("the connection was refused");
    expect(error.message).not.toBe(PROVIDER_CALL_FAILED_MESSAGE);
  });

  it("names the configured endpoint host", async () => {
    const error = await failWith(connectionError("ECONNREFUSED"), "localhost:11434");

    expect(error.message).toContain("localhost:11434");
  });

  it("says what to do about it", async () => {
    const error = await failWith(connectionError("ECONNREFUSED"), "localhost:11434");

    expect(error.message).toContain("Check that the endpoint is running");
  });

  it("reads the code through a nested cause chain", async () => {
    const error = await failWith(connectionError("ENOTFOUND"));

    expect(error.message).toContain("the host name could not be resolved");
  });

  it("keeps the bare constant when nothing about the failure is recognizable", async () => {
    const error = await failWith(new Error("something odd"));

    expect(error.message).toBe(PROVIDER_CALL_FAILED_MESSAGE);
  });
});

describe("findNetworkCause", () => {
  it.each([
    ["ENOTFOUND", "the host name could not be resolved"],
    ["EAI_AGAIN", "the host name could not be resolved"],
    ["ECONNRESET", "the connection was closed before a reply arrived"],
    ["ECONNABORTED", "the connection was closed before a reply arrived"],
    ["EPIPE", "the connection was closed before a reply arrived"],
    ["ETIMEDOUT", "the host could not be reached"],
    ["EHOSTUNREACH", "the host could not be reached"],
    ["ENETUNREACH", "the host could not be reached"],
    ["CERT_HAS_EXPIRED", "TLS certificate could not be verified"],
    ["DEPTH_ZERO_SELF_SIGNED_CERT", "TLS certificate could not be verified"],
    ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "TLS certificate could not be verified"],
    ["SELF_SIGNED_CERT_IN_CHAIN", "TLS certificate could not be verified"],
  ])("explains %s", async (code, expected) => {
    const error = await failWith(connectionError(code));

    expect(error.message).toContain(expected);
  });

  it("ignores a code it does not recognize", async () => {
    const error = await failWith(connectionError("ESOMETHINGELSE"));

    expect(error.message).toBe(PROVIDER_CALL_FAILED_MESSAGE);
  });

  it("ignores a non-string code", async () => {
    const error = await failWith(Object.assign(new Error("odd"), { code: 42 }));

    expect(error.message).toBe(PROVIDER_CALL_FAILED_MESSAGE);
  });

  it("stops walking the cause chain rather than looping forever on a cycle", async () => {
    const looping: { message: string; cause?: unknown } = { message: "loop" };
    looping.cause = looping;

    const error = await failWith(looping);

    expect(error.message).toBe(PROVIDER_CALL_FAILED_MESSAGE);
  });

  it("names the host even when the transport failure is unrecognizable", async () => {
    const error = await failWith(new Error("something odd"), "example.test:8080");

    expect(error.message).toBe("The translation provider request to example.test:8080 failed.");
  });
});

describe("the other classified codes name the status, never the host", () => {
  it("names only the status of RATE_LIMITED even with an endpoint host in hand", async () => {
    const error = await failWith(
      Object.assign(new Error("too many"), { status: 429 }),
      "localhost:11434",
    );

    expect(error.code).toBe("RATE_LIMITED");
    expect(error.message).toBe("The translation provider rate-limited this request (HTTP 429).");
  });

  it("names only the status of PROVIDER_UNAVAILABLE", async () => {
    const error = await failWith(
      Object.assign(new Error("boom"), { status: 503 }),
      "localhost:11434",
    );

    expect(error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(error.message).toBe("The translation provider is currently unavailable (HTTP 503).");
  });
});
