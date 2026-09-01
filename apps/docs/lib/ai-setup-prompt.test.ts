import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AI_SETUP_PROMPT } from "./ai-setup-prompt";

const LOCALES = ["", ".de", ".es", ".fr"];
const TEXT_FENCE = /```text\n([\s\S]*?)```/;

describe("AI_SETUP_PROMPT", () => {
  it.each(LOCALES)("matches the fenced prompt in start-with-ai%s.mdx verbatim", (suffix) => {
    const mdxPath = fileURLToPath(
      new URL(`../content/docs/(agents)/start-with-ai${suffix}.mdx`, import.meta.url),
    );
    const mdx = readFileSync(mdxPath, "utf-8");
    const match = mdx.match(TEXT_FENCE);
    expect(match).not.toBeNull();
    expect(AI_SETUP_PROMPT).toBe(match?.[1]);
  });
});
