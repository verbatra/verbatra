import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";
import { COMPARE_LAST_CHECKED } from "./landing-compare";
import { LANDING_LAST_UPDATED } from "./site";

type CopyRevision = { readonly date: string; readonly hash: string };

const COPY_REVISIONS: ReadonlyArray<CopyRevision> = [
  { date: "2026-10-16", hash: "2da575061b08be6bdff0f7a6a0bcff76e5113294f53dc174807431857dce4c0e" },
];

const COMPARE_CELL_REVISIONS: ReadonlyArray<CopyRevision> = [
  { date: "2026-10-15", hash: "686e5f24bef2e1a799485d1c64776df183a5e6f0cbb1925f1266a07742992a67" },
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

  it("gives every copy revision its own, later date, so a new hash needs a new LANDING_LAST_UPDATED", () => {
    const dates = COPY_REVISIONS.map((revision) => revision.date);
    expect(dates).toEqual(dates.toSorted());
    expect(new Set(dates).size).toBe(dates.length);
    const hashes = COPY_REVISIONS.map((revision) => revision.hash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

describe("COMPARE_LAST_CHECKED", () => {
  it("pins the comparison cells and page copy to the day they were last checked", () => {
    expect(COMPARE_CELL_REVISIONS.at(-1)).toEqual({
      date: COMPARE_LAST_CHECKED,
      hash: compareCellHash(),
    });
  });

  it("gives every cell revision its own, later date and its own hash", () => {
    const dates = COMPARE_CELL_REVISIONS.map((revision) => revision.date);
    expect(dates).toEqual(dates.toSorted());
    expect(new Set(dates).size).toBe(dates.length);
    const hashes = COMPARE_CELL_REVISIONS.map((revision) => revision.hash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});
