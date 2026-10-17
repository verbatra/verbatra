import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Locale } from "./i18n";
import { nodeVersionsLabel } from "./node-requirement";
import { NODE_RANGE } from "./site";

function messages(locale: Locale): { nodeRequirement: string; nodeMajorFrom: string } {
  const file = join(process.cwd(), "messages", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8")).landing.banner;
}

function requirement(range: string, locale: Locale): string {
  const banner = messages(locale);
  const majorFrom = (major: string, minimum: string) =>
    banner.nodeMajorFrom.replace("{major}", major).replace("{minimum}", minimum);
  return banner.nodeRequirement.replace("{versions}", nodeVersionsLabel(range, locale, majorFrom));
}

describe("nodeVersionsLabel", () => {
  it("states the engines range in every locale without reading as if Node.js 23 were included", () => {
    expect(NODE_RANGE).toBe("^22.18.0 || >=24");
    expect(requirement(NODE_RANGE, "en")).toBe("Requires Node.js 22 (22.18 or later) or 24+");
    expect(requirement(NODE_RANGE, "de")).toBe("Benötigt Node.js 22 (ab 22.18) oder 24+");
    expect(requirement(NODE_RANGE, "es")).toBe("Requiere Node.js 22 (22.18 o posterior) o 24+");
    expect(requirement(NODE_RANGE, "fr")).toBe(
      "Nécessite Node.js 22 (22.18 ou plus récente) ou 24+",
    );
    for (const locale of ["en", "de", "es", "fr"] as const) {
      expect(requirement(NODE_RANGE, locale)).not.toMatch(/22\.18\+/);
    }
  });

  it("keeps a patch version, drops a zero minor, and reads a bare caret as its major only", () => {
    const majorFrom = (major: string, minimum: string) => `${major} from ${minimum}`;
    expect(nodeVersionsLabel("^20.11.1", "en", majorFrom)).toBe("20 from 20.11.1");
    expect(nodeVersionsLabel("^20.0.0", "en", majorFrom)).toBe("20");
    expect(nodeVersionsLabel(">=24.0.0", "en", majorFrom)).toBe("24+");
    expect(nodeVersionsLabel(">=24.1", "en", majorFrom)).toBe("24.1+");
  });

  it("refuses a comparator it cannot state plainly, so a new range shape fails the build", () => {
    expect(() => nodeVersionsLabel("~22.18.0", "en", (major) => major)).toThrow("~22.18.0");
  });
});
