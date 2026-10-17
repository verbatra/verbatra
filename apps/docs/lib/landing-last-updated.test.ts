import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";
import { COMPARE_LAST_CHECKED } from "./landing-compare";
import { LANDING_LAST_UPDATED } from "./site";

type CopyRevision = { readonly date: string; readonly hash: string };

const COPY_REVISIONS: ReadonlyArray<CopyRevision> = [
  { date: "2026-10-16", hash: "70c39bcbbb1fd32405b5c2c58a507dbe8790ec2de962d42a755753ead613b90a" },
  { date: "2026-10-17", hash: "3981b894bb699c433941cfcfa95830f8de4096d94bd1d1866e6b515401c116b7" },
];

const COMPARE_CELL_REVISIONS: ReadonlyArray<CopyRevision> = [
  { date: "2026-10-15", hash: "fd99a5d9db846de71570aeac3ae8c96a4ad651015a05a52837f7a3ae1f55541d" },
];

function compareCellHash(): string {
  const hash = createHash("sha256");
  for (const locale of i18n.languages) {
    const path = fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url));
    const catalog = JSON.parse(readFileSync(path, "utf8")) as {
      landing: { compare: { rows: unknown } };
      compare: unknown;
    };
    hash.update(
      `${locale}\n${JSON.stringify(catalog.landing.compare.rows)}\n${JSON.stringify(catalog.compare)}\n`,
    );
  }
  return hash.digest("hex");
}

function landingCopyHash(): string {
  const hash = createHash("sha256");
  for (const locale of i18n.languages) {
    const path = fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url));
    const catalog = JSON.parse(readFileSync(path, "utf8")) as { landing: unknown };
    hash.update(`${locale}\n${JSON.stringify(catalog.landing)}\n`);
  }
  return hash.digest("hex");
}

describe("LANDING_LAST_UPDATED", () => {
  it("is an ISO date", () => {
    expect(LANDING_LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${LANDING_LAST_UPDATED}T00:00:00Z`).toISOString().slice(0, 10)).toBe(
      LANDING_LAST_UPDATED,
    );
  });

  it("pins the current landing copy to LANDING_LAST_UPDATED as the newest revision", () => {
    expect(COPY_REVISIONS.at(-1)).toEqual({ date: LANDING_LAST_UPDATED, hash: landingCopyHash() });
  });
});

describe("COMPARE_LAST_CHECKED", () => {
  it("pins the comparison cells and page copy to the day they were last checked", () => {
    expect(COMPARE_CELL_REVISIONS.at(-1)).toEqual({
      date: COMPARE_LAST_CHECKED,
      hash: compareCellHash(),
    });
  });
});
