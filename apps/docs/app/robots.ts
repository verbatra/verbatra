import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
] as const;

const DISALLOWED = ["/api/search"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOWED },
      { userAgent: [...AI_CRAWLERS], allow: "/", disallow: DISALLOWED },
    ],
    sitemap: new URL("/sitemap.xml", SITE_URL).href,
  };
}
