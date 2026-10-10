import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { homeOgImagePath, socialMetadata } from "./social-metadata";

const ORIGIN = "https://verbatra.kreitz-webdev.de";

describe("homeOgImagePath", () => {
  it("serves the default locale's card from the root and every other locale under its prefix", () => {
    expect(homeOgImagePath("en")).toBe("/home-og");
    expect(homeOgImagePath("de")).toBe("/de/home-og");
  });

  it("replaces the old static screenshot, which no longer exists in public/", () => {
    const stale = fileURLToPath(new URL("../public/og-image.png", import.meta.url));
    expect(existsSync(stale)).toBe(false);
  });
});

describe("socialMetadata", () => {
  const legal = socialMetadata({
    locale: "de",
    path: "/de/imprint",
    type: "website",
    title: "Impressum",
    description: "Anbieterkennzeichnung",
    image: { path: "/de/home-og", alt: "verbatra" },
  });

  it("points og:url at the page itself rather than the home page", () => {
    expect(legal.openGraph).toMatchObject({ url: `${ORIGIN}/de/imprint`, title: "Impressum" });
  });

  it("uses the page's locale and lists the other three as alternates", () => {
    expect(legal.openGraph).toMatchObject({
      locale: "de_DE",
      alternateLocale: ["en_US", "es_ES", "fr_FR"],
    });
  });

  it("gives Open Graph and Twitter the same generated image", () => {
    expect(legal.openGraph?.images).toEqual([
      { url: "/de/home-og", width: 1200, height: 630, alt: "verbatra" },
    ]);
    expect(legal.twitter).toMatchObject({
      card: "summary_large_image",
      site: "@mariokreitz",
      images: ["/de/home-og"],
    });
  });

  it("lets the Twitter card carry a longer title and description than Open Graph", () => {
    const home = socialMetadata({
      locale: "en",
      path: "/",
      type: "website",
      title: "short",
      description: "short description",
      image: { path: "/home-og", alt: "alt" },
      twitterTitle: "long title",
      twitterDescription: "long description",
    });
    expect(home.openGraph).toMatchObject({ title: "short", description: "short description" });
    expect(home.twitter).toMatchObject({ title: "long title", description: "long description" });
  });

  it("omits the description entirely when a page has none", () => {
    const bare = socialMetadata({
      locale: "en",
      path: "/docs/x",
      type: "article",
      title: "X",
      image: { path: "/docs-og/x", alt: "X" },
    });
    expect(bare.openGraph).not.toHaveProperty("description");
    expect(bare.twitter).not.toHaveProperty("description");
  });
});
