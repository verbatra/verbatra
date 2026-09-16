// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are source text under test, not templates
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeTempDir } from "../test-support.js";
import { diff } from "./diff.js";
import { doctor } from "./doctor.js";

const CONFIG: VerbatraConfig = baseConfig({
  extract: {
    framework: "i18next",
    roots: ["src"],
    literals: { ignore: ["Acme Inc."] },
    unused: { ignore: ["emails.*"] },
  },
});

const CATALOG = {
  nav: { home: "Home", away: "Away" },
  footer: "Footer",
  legacy: "Legacy",
  emails: { welcome: "Welcome" },
};

const NAV_SOURCE = [
  "export function Nav({ page }: { page: string }) {",
  "  return (",
  "    <nav>",
  "      <a>{t(`nav.${page}`)}</a>",
  '      <p>{t("footer")}</p>',
  "      <p>Hardcoded footer text</p>",
  "      <span>Acme Inc.</span>",
  "    </nav>",
  "  );",
  "}",
].join("\n");

let projectDir: string;

async function writeProjectFile(relativePath: string, content: string): Promise<void> {
  const path = join(projectDir, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

beforeEach(async () => {
  projectDir = await makeTempDir();
  await writeProjectFile(".verbatrarc.json", JSON.stringify(CONFIG));
  await writeProjectFile("locales/en.json", `${JSON.stringify(CATALOG, null, 2)}\n`);
  await writeProjectFile("locales/de.json", `${JSON.stringify(CATALOG, null, 2)}\n`);
  await writeProjectFile("src/nav.tsx", NAV_SOURCE);
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

describe("one extract block shared by diff --unused and doctor --literals", () => {
  it("reads a template-literal key under a known head as possibly dynamic, not as a dynamic key", async () => {
    const summary = await diff({ config: CONFIG, cwd: projectDir, unused: true });

    const report = summary.unused;
    if (report === undefined || report.status === "not-run") {
      throw new Error("expected the unused-key scan to run");
    }
    expect(report.status).toBe("complete");
    expect(report.unreliableBecause.map((entry) => entry.reason)).not.toContain("dynamic-keys");
    expect(report.possiblyDynamic).toEqual([
      { key: "nav.home", catalogKey: "nav.home", prefix: "nav." },
      { key: "nav.away", catalogKey: "nav.away", prefix: "nav." },
    ]);
    expect(report.dynamicPrefixes).toEqual([{ prefix: "nav.", file: "src/nav.tsx", line: 4 }]);
    expect(report.unused).toEqual([{ key: "legacy", catalogKey: "legacy" }]);
    expect(report.ignored).toEqual([{ key: "emails.welcome", catalogKey: "emails.welcome" }]);
  });

  it("still scans the same project for untranslated literals, honoring its own ignore list", async () => {
    const result = await doctor({ cwd: projectDir, literals: true });

    expect(result.checks.map((entry) => [entry.id, entry.status])).toEqual([
      ["config", "pass"],
      ["untranslated-literals", "fail"],
    ]);
    expect(result.literals?.scannedFiles).toBe(1);
    expect(result.literals?.diagnostics).toEqual([]);
    expect(result.literals?.findings.map((finding) => [finding.text, finding.line])).toEqual([
      ["Hardcoded footer text", 6],
    ]);
    expect(result.literals?.suppressed.map((entry) => [entry.text, entry.reason])).toEqual([
      ["Acme Inc.", "ignore-list"],
    ]);
  });
});
