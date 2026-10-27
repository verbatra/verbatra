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

  it("keeps the AI crawler group as a deliberate policy: allowed, and identical to * apart from its agents", () => {
    const rules = [robots().rules].flat();
    expect(rules).toHaveLength(2);
    const [everyone, aiCrawlers] = rules;
    expect(everyone?.userAgent).toBe("*");
    expect(Array.isArray(aiCrawlers?.userAgent) && aiCrawlers.userAgent.length).toBeGreaterThan(0);
    const { userAgent: _everyone, ...everyoneRule } = everyone ?? {};
    const { userAgent: _crawlers, ...crawlerRule } = aiCrawlers ?? {};
    expect(crawlerRule).toEqual(everyoneRule);
    expect(crawlerRule).not.toHaveProperty("crawlDelay");
  });

  it("points at the sitemap and sends no non-standard host line", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://verbatra.kreitz-webdev.de/sitemap.xml");
    expect(result).not.toHaveProperty("host");
  });
});
