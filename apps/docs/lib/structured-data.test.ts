import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHECK_EXIT_CODE } from "@/lib/check-demo";
import { howStepCopy } from "@/lib/how-steps";
import { SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import en from "../messages/en.json";
import {
  howToLd,
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

describe("softwareApplicationLd formats", () => {
  it("lists every format by its display label", () => {
    const result = softwareApplicationLd({
      description: "test",
      lang: "en",
      version: "1.0.0",
      studioVersion: "1.0.0",
      mcpVersion: "1.0.0",
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

describe("howToLd", () => {
  it("lists the three How steps in order, with the check exit code filled in", () => {
    const t = (key: string, values?: Record<string, number>): string => {
      const message = key
        .split(".")
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en.landing.how);
      return String(message).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name]));
    };
    const steps = howStepCopy(t).map((step) => ({ name: step.title, text: step.body }));
    const data = howToLd({ name: en.landing.how.heading, steps, lang: "en" });
    expect(data).toMatchObject({
      "@type": "HowTo",
      name: en.landing.how.heading,
      inLanguage: "en",
    });
    const listed = data.step as ReadonlyArray<Record<string, unknown>>;
    expect(listed.map((step) => [step.position, step.name])).toEqual([
      [1, en.landing.how.steps.setup.title],
      [2, en.landing.how.steps.translate.title],
      [3, en.landing.how.steps.check.title],
    ]);
    expect(listed[2]?.text).toBe(
      en.landing.how.steps.check.body.replace("{code}", String(CHECK_EXIT_CODE)),
    );
  });
});
