import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { START_HERE_COMPONENT } from "./agent-entry";
import { AI_SETUP_PROMPT } from "./ai-setup-prompt";
import { markdownUrl } from "./markdown-route";
import { SITE_URL } from "./site";

const LOCALES = ["", ".de", ".es", ".fr"];
const PROMPT_CHARACTER_LIMIT = 200;

function page(suffix: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../content/docs/(agents)/start-with-ai${suffix}.mdx`, import.meta.url)),
    "utf-8",
  );
}

describe("AI_SETUP_PROMPT", () => {
  it.each(LOCALES)(
    "reaches start-with-ai%s.mdx through the Start here banner, never copied into it",
    (suffix) => {
      const mdx = page(suffix);
      expect(mdx).toContain(`<${START_HERE_COMPONENT} />`);
      expect(mdx).not.toMatch(/```text\n/);
      for (const sentence of AI_SETUP_PROMPT.split(/(?<=\.) /)) {
        expect(mdx).not.toContain(sentence);
      }
    },
  );

  it("points the agent at the Markdown version of the setup page", () => {
    const url = `${SITE_URL}${markdownUrl("/docs/start-with-ai")}`;
    expect(AI_SETUP_PROMPT).toContain(` ${url} `);
  });

  it("keeps the spend gate, the key rule and the link-fail stop in the prompt itself, for an agent that cannot open the link", () => {
    expect(AI_SETUP_PROMPT).toContain("Spend nothing until I confirm.");
    expect(AI_SETUP_PROMPT).toContain("Never write or ask for an API key.");
    expect(AI_SETUP_PROMPT).toContain("If the link fails, stop.");
  });

  it("is one line, so the install box shows the whole text that Copy pastes", () => {
    expect(AI_SETUP_PROMPT).not.toMatch(/\n/);
    expect(AI_SETUP_PROMPT).toBe(AI_SETUP_PROMPT.trim());
  });

  it(`stays short enough to read at a glance (at most ${PROMPT_CHARACTER_LIMIT} characters)`, () => {
    expect(AI_SETUP_PROMPT.length).toBeLessThanOrEqual(PROMPT_CHARACTER_LIMIT);
  });
});
