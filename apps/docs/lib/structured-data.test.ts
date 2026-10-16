import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import en from "../messages/en.json";
import { LANDING_LAST_UPDATED, NODE_RANGE } from "./site";
import {
  breadcrumbListLd,
  ORGANIZATION_LOGO,
  organizationLd,
  SUPPORTED_AGENT_CLIENTS,
  softwareApplicationLd,
  techArticleLd,
  websiteLd,
} from "./structured-data";

const ORGANIZATION_ID = "https://verbatra.kreitz-webdev.de/#organization";
const AUTHOR_ID = "https://verbatra.kreitz-webdev.de/#author";
const WEBSITE_ID = "https://verbatra.kreitz-webdev.de/#website";

const ORGANIZATION_NODE = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "Verbatra",
  url: "https://verbatra.kreitz-webdev.de",
  logo: {
    "@type": "ImageObject",
    url: "https://verbatra.kreitz-webdev.de/icon-512.png",
    width: 512,
    height: 512,
  },
};

const ORGANIZATION_REF = { "@id": ORGANIZATION_ID };
const AUTHOR_REF = { "@id": AUTHOR_ID };
const WEBSITE_REF = { "@id": WEBSITE_ID };

describe("organizationLd", () => {
  it("names Verbatra, carries a stable @id, and links its GitHub org through sameAs", () => {
    expect(organizationLd()).toEqual({
      "@context": "https://schema.org",
      ...ORGANIZATION_NODE,
      sameAs: ["https://github.com/verbatra"],
    });
  });
});

describe("ORGANIZATION_LOGO", () => {
  it("is a served PNG of the declared size, above the 112px search engines require", () => {
    const png = readFileSync(new URL(`../public${ORGANIZATION_LOGO.path}`, import.meta.url));
    expect(png.toString("latin1", 1, 4)).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(ORGANIZATION_LOGO.width);
    expect(png.readUInt32BE(20)).toBe(ORGANIZATION_LOGO.height);
    expect(ORGANIZATION_LOGO.width).toBeGreaterThanOrEqual(112);
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
  it("dates the article only when a modification date is given", () => {
    const dated = techArticleLd({
      title: "Compare",
      path: "/compare",
      lang: "en",
      dateModified: "2026-10-15",
    });
    expect(dated.dateModified).toBe("2026-10-15");
    expect(
      techArticleLd({ title: "Providers", path: "/docs/providers", lang: "en" }),
    ).not.toHaveProperty("dateModified");
  });

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
      dateModified: "2026-10-16",
    });
    expect(result.author).toEqual(AUTHOR_REF);
    const hasPart = result.hasPart as ReadonlyArray<{ author: unknown }>;
    expect(hasPart).toHaveLength(2);
    for (const part of hasPart) {
      expect(part.author).toEqual(AUTHOR_REF);
    }
  });

  it("names Studio and the MCP server the way the visible copy does", () => {
    const result = softwareApplicationLd({
      description: "test",
      lang: "en",
      version: "1.0.0",
      studioVersion: "1.0.0",
      mcpVersion: "1.0.0",
      dateModified: "2026-10-16",
    });
    const names = (result.hasPart as ReadonlyArray<{ name: string }>).map((part) => part.name);
    expect(names).toEqual(["Verbatra Studio", "Verbatra MCP server"]);
    expect(en.landing.flow.items.studio.title).toContain("Verbatra Studio");
    expect(en.landing.flow.items.mcp.body).toContain("Verbatra MCP server");
  });

  it("states the Node.js range of the published packages for the app and every part", () => {
    const result = softwareApplicationLd({
      description: "test",
      lang: "en",
      version: "1.0.0",
      studioVersion: "1.0.0",
      mcpVersion: "1.0.0",
      dateModified: "2026-10-16",
    });
    const parts = result.hasPart as ReadonlyArray<{ operatingSystem: string }>;
    for (const value of [result.operatingSystem, ...parts.map((part) => part.operatingSystem)]) {
      expect(value).toBe(`Node.js ${NODE_RANGE}`);
    }
  });
});

describe("softwareApplicationLd entity", () => {
  it("names the entity Verbatra in every top-level node", () => {
    const app = softwareApplicationLd({
      description: "test",
      lang: "en",
      version: "1.0.0",
      studioVersion: "1.0.0",
      mcpVersion: "1.0.0",
      dateModified: "2026-10-16",
    });
    expect(app.name).toBe("Verbatra");
    expect(websiteLd({ lang: "en" }).name).toBe("Verbatra");
    expect(organizationLd().name).toBe("Verbatra");
  });

  it("carries the landing date as an ISO dateModified", () => {
    const app = softwareApplicationLd({
      description: "test",
      lang: "en",
      version: "1.0.0",
      studioVersion: "1.0.0",
      mcpVersion: "1.0.0",
      dateModified: LANDING_LAST_UPDATED,
    });
    expect(app.dateModified).toBe(LANDING_LAST_UPDATED);
    expect(String(app.dateModified)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("softwareApplicationLd formats", () => {
  it("lists every format by its display label", () => {
    const result = softwareApplicationLd({
      description: "test",
      lang: "en",
      version: "1.0.0",
      studioVersion: "1.0.0",
      mcpVersion: "1.0.0",
      dateModified: "2026-10-16",
    });
    const features = result.featureList as ReadonlyArray<string>;
    const formats = features.find((feature) => feature.startsWith("i18n formats: "));
    for (const label of [
      "i18next JSON",
      "Flutter ARB",
      "Java/Spring .properties",
      "Xcode String Catalog",
      "gettext .po/.pot",
    ]) {
      expect(formats).toContain(label);
    }
    expect(formats?.split(", ")).toHaveLength(SUPPORTED_FORMAT_IDS.length);
  });
});

describe("SUPPORTED_AGENT_CLIENTS", () => {
  it.each(["", ".de", ".es", ".fr"])(
    "each client has its own setup section in connect-an-mcp-client%s.mdx",
    (suffix) => {
      const page = readFileSync(
        new URL(`../content/docs/(agents)/connect-an-mcp-client${suffix}.mdx`, import.meta.url),
        "utf8",
      );
      const headings = new Set(
        [...page.matchAll(/^#{2,3} (.+)$/gm)].map((match) => match[1]?.trim()),
      );
      for (const client of SUPPORTED_AGENT_CLIENTS) {
        expect(headings.has(client), `${client} has no section`).toBe(true);
      }
    },
  );
});

describe("breadcrumbListLd", () => {
  it("leaves out a folder with no page, so every list item links its page and positions stay in order", () => {
    const ld = breadcrumbListLd({
      items: [
        { name: "Docs", url: "/docs" },
        { name: "Configure" },
        { name: "Providers", url: "/docs/providers" },
      ],
    });
    expect(ld.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Docs",
        item: "https://verbatra.kreitz-webdev.de/docs",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Providers",
        item: "https://verbatra.kreitz-webdev.de/docs/providers",
      },
    ]);
  });
});
