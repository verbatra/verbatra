import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { START_HERE_COMPONENT } from "./agent-entry";
import { AI_SETUP_PROMPT } from "./ai-setup-prompt";
import { AGENT_SKILLS_INSTALL_COMMAND } from "./install-commands";
import { markdownUrl } from "./markdown-route";
import { SITE_URL } from "./site";

const LOCALES = ["", ".de", ".es", ".fr"];
const PROMPT_CHARACTER_LIMIT = 300;

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
      const sentences = AI_SETUP_PROMPT.split("\n")
        .map((line) => line.replace(/^\d+\. /, ""))
        .flatMap((line) => line.split(/(?<=\.) /));
      for (const sentence of sentences) {
        expect(mdx).not.toContain(sentence);
      }
    },
  );

  it("points the agent at the Markdown version of the setup page", () => {
    const url = `${SITE_URL}${markdownUrl("/docs/start-with-ai")}`;
    expect(AI_SETUP_PROMPT).toContain(` ${url} `);
  });

  it("keeps the spend gate, the key rule and a no-spend fallback in the prompt itself, for an agent that cannot open the link", () => {
    expect(AI_SETUP_PROMPT).toContain("Spend nothing until I confirm.");
    expect(AI_SETUP_PROMPT).toContain("Never write or ask for an API key.");
    expect(AI_SETUP_PROMPT).toContain("(if it fails: npx @verbatra/cli init --help)");
  });

  it("is exactly two numbered lines, the skills install first, with no stray whitespace", () => {
    const lines = AI_SETUP_PROMPT.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(`1. Run: ${AGENT_SKILLS_INSTALL_COMMAND}`);
    expect(lines[1]).toMatch(/^2\. \S/);
    for (const line of lines) {
      expect(line).toBe(line.trim());
    }
  });

  it("leaves the agent choice to the skills CLI, which detects the calling agent", () => {
    expect(AI_SETUP_PROMPT).not.toContain(" -a ");
    expect(AI_SETUP_PROMPT).not.toContain("--agent");
  });

  it(`stays short enough to read at a glance (at most ${PROMPT_CHARACTER_LIMIT} characters)`, () => {
    expect(AI_SETUP_PROMPT.length).toBeLessThanOrEqual(PROMPT_CHARACTER_LIMIT);
  });
});
