import type { PageType } from "./page-type";

export interface PageFrontmatter {
  readonly title: string;
  readonly description?: string | undefined;
  readonly type?: PageType | undefined;
}

export function pageFrontmatter({ title, description, type }: PageFrontmatter): string {
  const fields: Array<[string, string | undefined]> = [
    ["title", title],
    ["description", description],
    ["type", type],
  ];
  const lines = fields.flatMap(([key, value]) =>
    value === undefined || value === "" ? [] : [`${key}: ${JSON.stringify(value)}`],
  );
  return `---\n${lines.join("\n")}\n---\n`;
}
