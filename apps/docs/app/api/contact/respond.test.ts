import { describe, expect, it } from "vitest";
import {
  forbiddenResponse,
  payloadTooLargeResponse,
  rateLimitedResponse,
  serverErrorResponse,
  successResponse,
  unsupportedMediaTypeResponse,
  validationErrorResponse,
} from "./respond";

describe("respond helpers", () => {
  it("successResponse returns a 200 with an ok status and no echoed content", async () => {
    const response = successResponse();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("two successResponse calls produce byte-identical bodies", async () => {
    const [a, b] = [successResponse(), successResponse()];
    expect(await a.text()).toBe(await b.text());
  });

  it("validationErrorResponse returns a 400 naming the failing fields", async () => {
    const response = validationErrorResponse({ name: "required" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ status: "invalid", errors: { name: "required" } });
  });

  it("rateLimitedResponse returns a 429", () => {
    expect(rateLimitedResponse().status).toBe(429);
  });

  it("forbiddenResponse returns a 403", () => {
    expect(forbiddenResponse().status).toBe(403);
  });

  it("serverErrorResponse returns a generic 500 with no provider detail", async () => {
    const response = serverErrorResponse();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ status: "error" });
  });

  it("payloadTooLargeResponse returns a 413", () => {
    expect(payloadTooLargeResponse().status).toBe(413);
  });

  it("unsupportedMediaTypeResponse returns a 415", () => {
    expect(unsupportedMediaTypeResponse().status).toBe(415);
  });
});
