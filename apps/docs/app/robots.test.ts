import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("allows everything except the search API route", () => {
    const result = robots();
    expect(result.rules).toContainEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/search"],
    });
  });

  it("names the AI crawlers explicitly, with the same rule, since a named group replaces the * group", () => {
    const result = robots();
    expect(result.rules).toContainEqual({
      userAgent: ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"],
      allow: "/",
      disallow: ["/api/search"],
    });
  });

  it("points at the sitemap and sends no non-standard host line", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://verbatra.kreitz-webdev.de/sitemap.xml");
    expect(result).not.toHaveProperty("host");
  });
});
