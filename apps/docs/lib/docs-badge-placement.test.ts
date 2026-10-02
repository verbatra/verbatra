import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type PageType, pageType } from "./page-type";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const HEADING = /^(#{2,4}) /;
const BADGE = /<AvailableFrom\b([^>]*)\/>/g;
const BADGE_ONLY = /^\s*(?:<AvailableFrom\b[^>]*\/>\s*)+$/;
const SECTION_BADGE_PAGES: ReadonlySet<PageType> = new Set(["how-to", "concept", "tutorial"]);
const DATING_PHRASES = [
  "first appears in",
  "appears in",
  "available from",
  "added in",
  "introduced in",
  "new in",
  "as of",
  "since",
  "from",
  "gibt es ab",
  "erstmals in",
  "neu in",
  "seit",
  "ab",
  "aparece por primera vez en",
  "disponible desde",
  "a partir de",
  "nuevo en",
  "desde",
  "apparaît pour la première fois en",
  "apparaît pour la première fois dans",
  "disponible depuis",
  "à partir de",
  "nouveau dans",
  "depuis",
  "dès",
];
const DATING = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${DATING_PHRASES.join("|")})\\s+(?:@verbatra\\/[a-z]+\\s+)?v?(\\d+\\.\\d+(?:\\.\\d+)?)(?![\\d.]*\\d)`,
  "giu",
);

type Placement = "page" | "heading" | "table" | "inline" | "stand-alone";

type Badge = {
  readonly line: number;
  readonly label: string;
  readonly version: string;
  readonly placement: Placement;
  readonly heading: number | undefined;
};

type Heading = { readonly line: number; readonly level: number };

type PageBadges = {
  readonly badges: readonly Badge[];
  readonly headings: readonly Heading[];
  readonly prose: ReadonlyArray<{ readonly line: number; readonly text: string }>;
};

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];
}

function badgesOn(text: string): Array<{ label: string; version: string }> {
  return [...text.matchAll(BADGE)].map(([, attributes = ""]) => {
    const version = attribute(attributes, "version") ?? "";
    const pkg = attribute(attributes, "pkg");
    return { version, label: pkg === undefined ? version : `${pkg}@${version}` };
  });
}

function bodyLines(source: string): Array<{ line: number; text: string }> {
  const frontmatter = FRONTMATTER.exec(source)?.[0] ?? "";
  const offset = frontmatter.split("\n").length - 1;
  const lines: Array<{ line: number; text: string }> = [];
  let fence: string | undefined;
  source
    .slice(frontmatter.length)
    .split("\n")
    .forEach((text, index) => {
      const opening = FENCE.exec(text)?.[1];
      if (fence !== undefined) {
        if (text.trim().startsWith(fence) && /^[`~]+$/.test(text.trim())) fence = undefined;
      } else if (opening !== undefined) {
        fence = opening;
      } else {
        lines.push({ line: offset + index + 1, text });
      }
    });
  return lines;
}

function placementOf(
  text: string,
  previous: { text: string; placement: Placement | undefined } | undefined,
  heading: Heading | undefined,
): Placement {
  if (HEADING.test(text)) return "heading";
  if (text.startsWith("|")) return "table";
  if (!BADGE_ONLY.test(text)) return "inline";
  if (heading === undefined) return "page";
  if (previous !== undefined && (HEADING.test(previous.text) || previous.placement === "heading")) {
    return "heading";
  }
  return "stand-alone";
}

function readBadges(source: string): PageBadges {
  const badges: Badge[] = [];
  const headings: Heading[] = [];
  const prose: Array<{ line: number; text: string }> = [];
  let previous: { text: string; placement: Placement | undefined } | undefined;
  for (const { line, text } of bodyLines(source)) {
    if (text.trim() === "") continue;
    const level = HEADING.exec(text)?.[1]?.length;
    if (level !== undefined) headings.push({ line, level });
    const found = badgesOn(text);
    const placement = found.length === 0 ? undefined : placementOf(text, previous, headings.at(-1));
    const heading = placement === "heading" ? headings.length - 1 : undefined;
    for (const badge of found)
      badges.push({ ...badge, line, placement: placement ?? "inline", heading });
    prose.push({ line, text: text.replace(BADGE, " ") });
    previous = { text, placement };
  }
  return { badges, headings, prose };
}

function sectionEnd(page: PageBadges, headingIndex: number): number {
  const start = page.headings[headingIndex];
  const next = page.headings
    .slice(headingIndex + 1)
    .find(({ level }) => level <= (start?.level ?? 0));
  return next?.line ?? Number.POSITIVE_INFINITY;
}

function nextHeadingLine(page: PageBadges, line: number): number {
  return page.headings.find((heading) => heading.line > line)?.line ?? Number.POSITIVE_INFINITY;
}

function scopeOf(page: PageBadges, badge: Badge): [number, number] {
  switch (badge.placement) {
    case "page":
      return [0, Number.POSITIVE_INFINITY];
    case "heading":
      return [badge.line, sectionEnd(page, badge.heading ?? -1)];
    case "table":
      return [badge.line, badge.line + 1];
    default:
      return [badge.line, nextHeadingLine(page, badge.line)];
  }
}

function sameRelease(a: string, b: string): boolean {
  const normalize = (version: string) =>
    version.split(".").length === 2 ? `${version}.0` : version;
  return normalize(a) === normalize(b);
}

const SECTION_PLACEMENTS: ReadonlySet<Placement> = new Set(["page", "heading", "table"]);

function placementViolations(page: PageBadges, type: string | undefined): string[] {
  if (type === undefined || !SECTION_BADGE_PAGES.has(type as PageType)) return [];
  return page.badges
    .filter(({ placement }) => !SECTION_PLACEMENTS.has(placement))
    .map(({ line, placement }) => `${line}: ${placement} badge on a ${type} page`);
}

function pageBadgeViolations(page: PageBadges): string[] {
  const pageBadges = page.badges.filter(({ placement }) => placement === "page");
  const repeated = page.badges
    .filter(
      ({ placement, label }) =>
        placement !== "page" && pageBadges.some((badge) => badge.label === label),
    )
    .map(({ line, label }) => `${line}: badge ${label} repeats the page-level badge`);
  const second = pageBadges.slice(1, 2).map(({ line }) => `${line}: a second page-level badge`);
  return [...second, ...repeated];
}

function headingViolations(page: PageBadges): string[] {
  const seen = new Set<number>();
  return page.badges.flatMap(({ heading, line }) => {
    if (heading === undefined) return [];
    if (!seen.has(heading)) {
      seen.add(heading);
      return [];
    }
    return [`${line}: a second badge on one heading`];
  });
}

function restatedBadge(page: PageBadges, line: number, version: string): Badge | undefined {
  return page.badges.find((badge) => {
    const [from, to] = scopeOf(page, badge);
    return line >= from && line < to && sameRelease(badge.version, version);
  });
}

function restatementViolations(page: PageBadges): string[] {
  return page.prose.flatMap(({ line, text }) =>
    [...text.matchAll(DATING)].flatMap(([, version = ""]) => {
      const badge = restatedBadge(page, line, version);
      return badge === undefined
        ? []
        : [`${line}: prose restates the ${badge.label} badge of line ${badge.line}`];
    }),
  );
}

function badgeViolations(source: string): string[] {
  const page = readBadges(source);
  return [
    ...placementViolations(page, pageType(source)),
    ...pageBadgeViolations(page),
    ...headingViolations(page),
    ...restatementViolations(page),
  ];
}

const AWAITING_FIX: ReadonlySet<string> = new Set(["(concepts)/translation-safety"]);

function allPages(): string[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".mdx"))
    .sort();
}

function awaitingFix(file: string): boolean {
  return AWAITING_FIX.has(file.replace(/(\.[a-z]{2})?\.mdx$/, ""));
}

function page(type: PageType, body: string): string {
  return `---\ntitle: Fixture\ntype: ${type}\n---\nIntro.\n\n${body}\n`;
}

describe("AvailableFrom badge placement", () => {
  it.each(allPages().filter((file) => !awaitingFix(file)))(
    "places every badge by the rules in %s",
    (file) => {
      expect(badgeViolations(readFileSync(join(CONTENT_DIR, file), "utf8"))).toEqual([]);
    },
  );

  it.each(allPages().filter(awaitingFix))(
    "still finds the violation %s awaits, so the exemption is dropped once it is fixed",
    (file) => {
      expect(badgeViolations(readFileSync(join(CONTENT_DIR, file), "utf8"))).not.toEqual([]);
    },
  );

  it("accepts a badge at page level, under a heading, in a table row and in a header cell", () => {
    const fixture = `---\ntype: how-to\n---\n<AvailableFrom version="0.10.0" />\n\nIntro.\n\n| Id | Never flagged <AvailableFrom version="0.12.0" /> |\n| --- | --- |\n| a | b |\n\n## A\n\n<AvailableFrom version="0.11.0" />\n\nText.\n\n| Code | Effect |\n| --- | --- |\n| \`X\` | does X <AvailableFrom version="0.12.0" /> |\n\n### B <AvailableFrom version="0.12.0" pkg="@verbatra/studio" />\n\nText.\n`;
    expect(badgeViolations(fixture)).toEqual([]);
  });

  it("rejects a stand-alone or inline badge on how-to, concept and tutorial pages only", () => {
    const body =
      '## A\n\nOld text.\n\n<AvailableFrom version="0.12.0" />\n\nNew text.\n\n- `x` <AvailableFrom version="0.12.0" />: item';
    for (const type of ["how-to", "concept", "tutorial"] as const) {
      expect(badgeViolations(page(type, body))).toEqual([
        `11: stand-alone badge on a ${type} page`,
        `15: inline badge on a ${type} page`,
      ]);
    }
    expect(badgeViolations(page("reference", body))).toEqual([]);
  });

  it("rejects a badge inside a list item, where it reads as stand-alone", () => {
    const body = '## A\n\n- One.\n\n  <AvailableFrom version="0.12.0" />\n\n- Two.';
    expect(badgeViolations(page("concept", body))).toEqual([
      "11: stand-alone badge on a concept page",
    ]);
  });

  it("rejects a second badge on one heading", () => {
    const body =
      '## A\n\n<AvailableFrom version="0.3.0" pkg="@verbatra/mcp" />\n\n<AvailableFrom version="0.6.0" pkg="@verbatra/studio" />\n\nText.';
    expect(badgeViolations(page("reference", body))).toEqual(["11: a second badge on one heading"]);
  });

  it("rejects a badge that repeats the page-level badge, and a second page-level badge", () => {
    const fixture = `---\ntype: how-to\n---\n<AvailableFrom version="0.12.0" />\n\n<AvailableFrom version="0.11.0" />\n\n## A\n\n<AvailableFrom version="0.12.0" />\n\nText.\n`;
    expect(badgeViolations(fixture)).toEqual([
      "6: a second page-level badge",
      "10: badge 0.12.0 repeats the page-level badge",
    ]);
  });

  it.each([
    ["en", "`X` first appears in 0.12.0."],
    ["en", "From 0.12 it also writes the file."],
    ["de", "`X` gibt es ab 0.12.0."],
    ["es", "`X` aparece por primera vez en 0.12.0."],
    ["fr", "`X` apparaît pour la première fois en 0.12.0."],
    ["fr", "À partir de 0.12.0, il écrit le fichier."],
  ])("rejects %s prose that restates the badge version: %s", (_locale, sentence) => {
    const body = `## A\n\n<AvailableFrom version="0.12.0" />\n\n${sentence}`;
    expect(badgeViolations(page("reference", body))).toEqual([
      "11: prose restates the 0.12.0 badge of line 9",
    ]);
  });

  it("keeps a requirement, another version, and a version outside the badge's section", () => {
    const body = [
      "## A",
      '<AvailableFrom version="0.12.0" />',
      "It needs a `version` of `0.12.0` or newer, and braucht eine `version` ab `0.12.0`.",
      "Up to 0.11 it returned the map; from 0.11.0 it was flat.",
      "## B",
      "From 0.12.0 any other key fails.",
    ].join("\n\n");
    expect(badgeViolations(page("reference", body))).toEqual([]);
  });
});
