import { describe, expect, it } from "vitest";
import { organizationLd, softwareApplicationLd, techArticleLd, websiteLd } from "./structured-data";

const ORGANIZATION_ID = "https://verbatra.kreitz-webdev.de/#organization";
const AUTHOR_ID = "https://verbatra.kreitz-webdev.de/#author";
const WEBSITE_ID = "https://verbatra.kreitz-webdev.de/#website";

const ORGANIZATION_NODE = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "verbatra",
  url: "https://verbatra.kreitz-webdev.de",
};

const ORGANIZATION_REF = { "@id": ORGANIZATION_ID };
const AUTHOR_REF = { "@id": AUTHOR_ID };
const WEBSITE_REF = { "@id": WEBSITE_ID };

describe("organizationLd", () => {
  it("names verbatra, carries a stable @id, and links its GitHub org through sameAs", () => {
    expect(organizationLd()).toEqual({
      "@context": "https://schema.org",
      ...ORGANIZATION_NODE,
      sameAs: ["https://github.com/verbatra"],
    });
  });
});

describe("websiteLd", () => {
  it("references the organization node by @id instead of embedding it", () => {
    expect(websiteLd({ lang: "en" }).publisher).toEqual(ORGANIZATION_REF);
  });

  it("carries a stable @id and embeds the canonical author definition", () => {
    const result = websiteLd({ lang: "en" });
    expect(result["@id"]).toBe(WEBSITE_ID);
    expect(result.author).toEqual({
      "@type": "Person",
      "@id": AUTHOR_ID,
      name: "Mario Kreitz",
      url: "https://github.com/mariokreitz",
    });
  });
});

describe("techArticleLd", () => {
  it("references the organization node by @id instead of embedding it", () => {
    const result = techArticleLd({
      title: "Providers",
      path: "/docs/providers",
      lang: "en",
    });
    expect(result.publisher).toEqual(ORGANIZATION_REF);
  });

  it("references the author and website nodes by @id instead of embedding them", () => {
    const result = techArticleLd({
      title: "Providers",
      path: "/docs/providers",
      lang: "en",
    });
    expect(result.author).toEqual(AUTHOR_REF);
    expect(result.isPartOf).toEqual(WEBSITE_REF);
  });
});

describe("softwareApplicationLd", () => {
  it("references the author node by @id at the top level and in every hasPart entry", () => {
    const result = softwareApplicationLd({
      description: "test",
      lang: "en",
      version: "1.0.0",
      studioVersion: "1.0.0",
      mcpVersion: "1.0.0",
    });
    expect(result.author).toEqual(AUTHOR_REF);
    const hasPart = result.hasPart as ReadonlyArray<{ author: unknown }>;
    expect(hasPart).toHaveLength(2);
    for (const part of hasPart) {
      expect(part.author).toEqual(AUTHOR_REF);
    }
  });
});
