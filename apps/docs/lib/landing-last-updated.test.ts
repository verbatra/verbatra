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
  { date: "2026-10-17", hash: "629113669eeeee0c43172185a7e775e2e94002043ee0072ee4dfc75002aa03e9" },
  { date: "2026-10-26", hash: "86da6b689fa26ac25c89d7f2f8c27e7fa8e5f490897218736b410691d8a8dd4c" },
  { date: "2026-10-27", hash: "e1b551a807bf9177fdd187c6afc34e193929d8bf031f6fc8ce7375d87055514c" },
];

const COMPARE_CELL_REVISIONS: ReadonlyArray<CopyRevision> = [
  { date: "2026-10-15", hash: "902177bf643763a6041c4de579b581536e5f1f8706cf919c2985436b011403a5" },
  { date: "2026-10-15", hash: "bee5f991697639ddc4bd5ffefe029d3a89e4fae191018a4bfebab5d0643e4cf0" },
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
