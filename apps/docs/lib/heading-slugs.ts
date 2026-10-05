export function headingSlugs(source: string): ReadonlyArray<string> {
  return [...source.matchAll(/^#{2,6} (.+)$/gm)].map((match) =>
    (match[1] as string)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s/g, "-"),
  );
}
