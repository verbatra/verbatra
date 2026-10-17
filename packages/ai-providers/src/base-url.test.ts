import { describe, expect, it } from "vitest";
import { endpointContextOf, httpBaseUrlSchema } from "./base-url.js";

describe("httpBaseUrlSchema", () => {
  it("accepts http and https URLs", () => {
    expect(httpBaseUrlSchema.safeParse("http://localhost:5000").success).toBe(true);
    expect(httpBaseUrlSchema.safeParse("https://translate.example.test/api").success).toBe(true);
  });

  it("rejects a value that is not a URL and a URL with another scheme", () => {
    expect(httpBaseUrlSchema.safeParse("localhost:5000").success).toBe(false);
    expect(httpBaseUrlSchema.safeParse("ftp://translate.example.test").success).toBe(false);
  });
});

describe("endpointContextOf", () => {
  it("returns host and port", () => {
    expect(endpointContextOf("http://localhost:11434/v1")).toEqual({
      endpointHost: "localhost:11434",
    });
  });

  it("drops the path and query, which are not the endpoint's identity", () => {
    expect(endpointContextOf("https://api.example.test/v1/chat?key=abc")).toEqual({
      endpointHost: "api.example.test",
    });
  });

  it("drops user-info, so a credential embedded in the URL can never reach a message", () => {
    expect(endpointContextOf("https://user:sk-secret@api.example.test:8443/v1")).toEqual({
      endpointHost: "api.example.test:8443",
    });
  });

  it("returns undefined for a value that is not a URL at all", () => {
    expect(endpointContextOf("not a url")).toBeUndefined();
  });
});
