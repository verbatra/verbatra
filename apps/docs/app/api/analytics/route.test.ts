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

function setCookies(response: Response): string[][] {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";").map((part) => part.trim()));
}

const LEGACY_CLEARED = [
  "verbatra_analytics_optout=",
  "HttpOnly",
  "Secure",
  "SameSite=Lax",
  "Path=/",
  "Max-Age=0",
];

function choiceAttributes(choice: string): string[] {
  return [`verbatra_analytics=${choice}`, "Secure", "SameSite=Lax", "Path=/", "Max-Age=31536000"];
}

describe("POST /api/analytics", () => {
  it.each(["full", "default", "off"])(
    "stores the choice %s for a year in a readable cookie and clears the legacy cookie",
    async (choice) => {
      const response = await submit(`choice=${choice}&lang=en`);

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `/privacy?analytics=${choice}#analytics-${choice}`,
      );
      expect(setCookies(response)).toEqual([choiceAttributes(choice), LEGACY_CLEARED]);
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );

  it("returns to the localized privacy page", async () => {
    const response = await submit("choice=full&lang=de");
    expect(response.headers.get("location")).toBe("/de/privacy?analytics=full#analytics-full");
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
    ["the retired on choice", "choice=on&lang=en"],
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
