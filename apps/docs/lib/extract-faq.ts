import type { FaqItem } from "@/lib/structured-data";

function headingText(line: string): string {
  return line
    .replace(/^##\s+/, "")
    .replace(/\s*\[#[^\]]*\]\s*$/, "")
    .trim();
}

function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(/^\s*[*-]\s+/gm, "- ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFaqItems(markdown: string): FaqItem[] {
  const items: FaqItem[] = [];
  const sections = markdown.split(/^(?=## )/m);
  for (const section of sections) {
    if (!section.startsWith("## ")) continue;
    const newlineIndex = section.indexOf("\n");
    if (newlineIndex === -1) continue;
    const question = headingText(section.slice(0, newlineIndex));
    const answer = plainText(section.slice(newlineIndex + 1));
    if (question.length > 0 && answer.length > 0) items.push({ question, answer });
  }
  return items;
}

export function withoutQuestions(
  items: ReadonlyArray<FaqItem>,
  questions: ReadonlyArray<string>,
): FaqItem[] {
  const taken = new Set(questions);
  return items.filter((item) => !taken.has(item.question));
}
