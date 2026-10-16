import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";
import { LANDING_LAST_UPDATED } from "./site";

const PINNED = {
  date: "2026-10-16",
  hash: "638a01537914ef654495a9cb0529952bcae604297eae0815aed831a389491b82",
};

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

  it("is bumped whenever the landing copy changes: update the date and this hash together", () => {
    expect({ date: LANDING_LAST_UPDATED, hash: landingCopyHash() }).toEqual(PINNED);
  });
});
