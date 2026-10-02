export const PAGE_TYPES = ["overview", "tutorial", "how-to", "concept", "reference"] as const;

export type PageType = (typeof PAGE_TYPES)[number];

export const WORD_CEILING: Readonly<Record<PageType, number>> = {
  overview: 600,
  tutorial: 900,
  "how-to": 1200,
  concept: 1800,
  reference: 3000,
};

export const LOOKUP_REFERENCE_PAGES: ReadonlySet<string> = new Set(["(reference)/error-codes.mdx"]);

export const LOOKUP_REFERENCE_CEILING = 12000;

export const CLI_REFERENCE_PAGES: readonly string[] = ["index", "output"];

export const COMMAND_PAGE_CEILING = 2000;

export const HEADROOM_WARNING_RATIO = 0.9;

export type PageBudget = {
  readonly file: string;
  readonly type: PageType;
  readonly words: number;
  readonly ceiling: number;
};

export const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

export function proseWords(source: string): number {
  const body = source
    .replace(FRONTMATTER, "")
    .replace(/^```[\s\S]*?^```$/gm, "")
    .replace(/<[^>]+>/g, " ");
  return body.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word)).length;
}

export function isPageType(value: string): value is PageType {
  return (PAGE_TYPES as readonly string[]).includes(value);
}

export function pageType(source: string): string | undefined {
  const frontmatter = FRONTMATTER.exec(source)?.[1] ?? "";
  return /^type:\s*(\S+)\s*$/m.exec(frontmatter)?.[1];
}

export function isCommandPage(file: string): boolean {
  const name = /^cli\/([^/.]+)\.mdx$/.exec(file)?.[1];
  return name !== undefined && !CLI_REFERENCE_PAGES.includes(name);
}

export function wordCeiling(file: string, type: PageType): number {
  if (LOOKUP_REFERENCE_PAGES.has(file)) return LOOKUP_REFERENCE_CEILING;
  if (isCommandPage(file)) return Math.min(WORD_CEILING[type], COMMAND_PAGE_CEILING);
  return WORD_CEILING[type];
}

export function pageBudget(file: string, source: string): PageBudget | undefined {
  const type = pageType(source);
  if (type === undefined || !isPageType(type)) return undefined;
  return { file, type, words: proseWords(source), ceiling: wordCeiling(file, type) };
}

export function pagesNearCeiling(budgets: readonly PageBudget[]): PageBudget[] {
  return budgets
    .filter(({ words, ceiling }) => words >= ceiling * HEADROOM_WARNING_RATIO)
    .sort((a, b) => b.words / b.ceiling - a.words / a.ceiling || a.file.localeCompare(b.file));
}

export function formatBudgetReport(budgets: readonly PageBudget[]): string {
  const near = pagesNearCeiling(budgets);
  const percent = Math.round(HEADROOM_WARNING_RATIO * 100);
  if (near.length === 0) return `No page is at or above ${percent}% of its ceiling.`;
  const rows = near.map(({ file, type, words, ceiling }) =>
    [
      file.padEnd(48),
      type.padEnd(9),
      `${words}/${ceiling}`.padStart(11),
      `${Math.round((words / ceiling) * 100)}%`.padStart(5),
      `${ceiling - words} left`.padStart(10),
    ].join(" "),
  );
  return [`Pages at or above ${percent}% of their ceiling: ${near.length}`, ...rows].join("\n");
}
