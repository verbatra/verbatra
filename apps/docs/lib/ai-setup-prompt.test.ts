import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AI_SETUP_PROMPT } from "./ai-setup-prompt";
import { markdownUrl } from "./markdown-route";
import { SITE_URL } from "./site";

const LOCALES = ["", ".de", ".es", ".fr"];
const TEXT_FENCE = /```text\n([\s\S]*?)```/g;
const PROMPT_WORD_LIMIT = 80;

function page(suffix: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../content/docs/(agents)/start-with-ai${suffix}.mdx`, import.meta.url)),
    "utf-8",
  );
}

describe("AI_SETUP_PROMPT", () => {
  it.each(LOCALES)("is the one fenced prompt in start-with-ai%s.mdx, verbatim", (suffix) => {
    const fences = [...page(suffix).matchAll(TEXT_FENCE)].map((match) => match[1]);
    expect(fences).toEqual([AI_SETUP_PROMPT]);
  });

  it("points the agent at the Markdown version of the setup page", () => {
    const url = `${SITE_URL}${markdownUrl("/docs/start-with-ai")}`;
    expect(AI_SETUP_PROMPT.replace(/\s+/g, " ")).toContain(` ${url} `);
  });

  it("keeps the spend gate and the key rule in the prompt itself, for an agent that cannot open the link", () => {
    const prompt = AI_SETUP_PROMPT.replace(/\s+/g, " ");
    expect(prompt).toContain("never run a real `verbatra translate` without my explicit go-ahead");
    expect(prompt).toContain("If you cannot open the link, stop");
    expect(prompt).toContain("Never write, invent, or ask for an API key value.");
  });

  it(`stays short enough to read in the install box (under ${PROMPT_WORD_LIMIT} words)`, () => {
    expect(AI_SETUP_PROMPT.trim().split(/\s+/).length).toBeLessThan(PROMPT_WORD_LIMIT);
  });
});
