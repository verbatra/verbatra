export const PAGE_TYPES = ["overview", "tutorial", "how-to", "concept", "reference"] as const;

export type PageType = (typeof PAGE_TYPES)[number];

export const LOOKUP_REFERENCE_PAGES: ReadonlySet<string> = new Set(["(reference)/error-codes.mdx"]);

export const LOOKUP_REFERENCE_CEILING = 12000;

export function proseWords(source: string): number {
  const body = source
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/^```[\s\S]*?^```$/gm, "")
    .replace(/<[^>]+>/g, " ");
  return body.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word)).length;
}
