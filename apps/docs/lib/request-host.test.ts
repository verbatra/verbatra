import { describe, expect, it } from "vitest";
import { requestHost } from "./request-host";

const SITE = "verbatra.kreitz-webdev.de";

function hostOf(headers: Record<string, string>, urlHost = "127.0.0.1:3000"): string {
  return requestHost(new Headers(headers), urlHost);
}

describe("requestHost", () => {
  it("reads the Host header, which nginx sets to the requested host", () => {
    expect(hostOf({ host: SITE })).toBe(SITE);
  });

  it("prefers Host over any X-Forwarded-Host a client sent", () => {
    expect(hostOf({ host: "localhost:3480", "x-forwarded-host": SITE })).toBe("localhost:3480");
    expect(hostOf({ host: SITE, "x-forwarded-host": "localhost" })).toBe(SITE);
  });

  it("takes the last X-Forwarded-Host value, the one the nearest proxy appended, when Host is absent", () => {
    expect(hostOf({ "x-forwarded-host": `localhost, ${SITE}` })).toBe(SITE);
    expect(hostOf({ "x-forwarded-host": `${SITE}, localhost` })).toBe("localhost");
    expect(hostOf({ "x-forwarded-host": ` ${SITE} ,` })).toBe(SITE);
  });

  it("falls back to the URL host when neither header is present", () => {
    expect(hostOf({})).toBe("127.0.0.1:3000");
    expect(hostOf({ host: " ", "x-forwarded-host": " , " })).toBe("127.0.0.1:3000");
  });
});
