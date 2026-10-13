import { describe, expect, it } from "vitest";
import { POST } from "./route";

const FORM = "application/x-www-form-urlencoded";

function submit(
  body: string,
  headers: Record<string, string> = { origin: "https://verbatra.kreitz-webdev.de" },
  contentType = FORM,
  url = "https://verbatra.kreitz-webdev.de/api/analytics",
): Promise<Response> {
  return POST(
    new Request(url, {
      method: "POST",
      headers: { "content-type": contentType, ...headers },
      body,
    }),
  );
}

function cookieAttributes(response: Response): string[] {
  return (response.headers.get("set-cookie") ?? "").split(";").map((part) => part.trim());
}

describe("POST /api/analytics", () => {
  it("sets the opt-out cookie for a year and sends the visitor back to the privacy page", async () => {
    const response = await submit("choice=off&lang=en");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/privacy?analytics=off#analytics-off");
    expect(cookieAttributes(response)).toEqual([
      "verbatra_analytics_optout=1",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Path=/",
      "Max-Age=31536000",
    ]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("clears the cookie when the visitor allows analytics again", async () => {
    const response = await submit("choice=on&lang=de");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/de/privacy?analytics=on#analytics-on");
    expect(cookieAttributes(response)).toEqual([
      "verbatra_analytics_optout=",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Path=/",
      "Max-Age=0",
    ]);
  });

  it.each(["fr", "es"])("returns to the %s privacy page", async (lang) => {
    const response = await submit(`choice=off&lang=${lang}`);
    expect(response.headers.get("location")).toBe(`/${lang}/privacy?analytics=off#analytics-off`);
  });

  it.each([
    ["an unknown locale", "choice=off&lang=xx"],
    ["a locale smuggling a path", "choice=off&lang=%2F%2Fevil.example"],
    ["an absolute return URL", "choice=off&lang=https://evil.example/"],
    ["an unknown choice", "choice=maybe&lang=en"],
    ["a missing choice", "lang=en"],
  ])("rejects %s without a cookie or a redirect", async (_case, body) => {
    const response = await submit(body);

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses a submission from a foreign origin", async () => {
    const response = await submit("choice=off&lang=en", { origin: "https://evil.example" });

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses an opaque origin", async () => {
    const response = await submit("choice=off&lang=en", { origin: "null" });
    expect(response.status).toBe(403);
  });

  it("accepts a same-host submission on a local run", async () => {
    const response = await submit(
      "choice=off&lang=en",
      { origin: "http://localhost:3480", host: "localhost:3480" },
      FORM,
      "http://localhost:3480/api/analytics",
    );
    expect(response.status).toBe(303);
  });

  it("accepts a same-origin form post that carries no Origin header", async () => {
    const response = await submit("choice=off&lang=en", { "sec-fetch-site": "same-origin" });
    expect(response.status).toBe(303);
  });

  it("refuses a cross-site form post", async () => {
    const response = await submit("choice=off&lang=en", {
      origin: "https://verbatra.kreitz-webdev.de",
      "sec-fetch-site": "cross-site",
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses a body that is not a form", async () => {
    const response = await submit('{"choice":"off"}', undefined, "application/json");
    expect(response.status).toBe(415);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses an oversized body", async () => {
    const response = await submit(`choice=off&lang=en&pad=${"x".repeat(1024)}`);
    expect(response.status).toBe(413);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
