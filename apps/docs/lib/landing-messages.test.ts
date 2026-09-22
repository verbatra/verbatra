import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";

const LANDING_NAMESPACES = [
  "hero",
  "terminal",
  "install",
  "nav",
  "footer",
  "finalClose",
  "gate",
  "proof",
  "how",
  "marquee",
  "providers",
  "loop",
  "gains",
] as const;

type MessageTree = { [key: string]: string | MessageTree };

function load(locale: string): MessageTree {
  const path = fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as MessageTree;
}

function leafKeys(tree: MessageTree, prefix: string): ReadonlyArray<string> {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : leafKeys(value, path);
  });
}

function landingKeys(locale: string): ReadonlyArray<string> {
  const landing = load(locale).landing;
  if (typeof landing !== "object") throw new Error(`no landing namespace in ${locale}.json`);
  return LANDING_NAMESPACES.flatMap((namespace) => {
    const tree = landing[namespace];
    if (typeof tree !== "object") throw new Error(`no landing.${namespace} in ${locale}.json`);
    return leafKeys(tree, `landing.${namespace}`);
  }).toSorted();
}

const EM_DASH = String.fromCharCode(0x2014);

describe("landing message parity", () => {
  const source = landingKeys(i18n.defaultLanguage);

  it("covers every namespace the landing chrome reads", () => {
    expect(source.length).toBeGreaterThan(0);
    expect(source).toContain("landing.nav.skipToContent");
    expect(source).toContain("landing.proof.lock.title");
    expect(source).toContain("landing.terminal.sessionLabel");
    expect(source).toContain("landing.gate.rows.reason");
    expect(source).toContain("landing.loop.rows.ci.title");
    expect(source).toContain("landing.marquee.frameworks.react");
    expect(source).toContain("landing.providers.kinds.gemini");
    expect(source).toContain("landing.gains.items.gate.title");
  });

  for (const locale of i18n.languages.filter((lang) => lang !== i18n.defaultLanguage)) {
    it(`${locale} holds exactly the source keys`, () => {
      expect(landingKeys(locale)).toEqual(source);
    });
  }

  it("carries no em dash in any locale", () => {
    for (const locale of i18n.languages) {
      const path = fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url));
      expect(readFileSync(path, "utf8")).not.toContain(EM_DASH);
    }
  });
});
