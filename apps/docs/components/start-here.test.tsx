// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { AGENT_INIT_COMMAND } from "@/lib/install-commands";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const { StartHere } = await import("./start-here");
const { PackageInstall } = await import("./landing/package-install");

function render(node: React.ReactNode): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function commands(doc: Document): Array<string | null> {
  return [...doc.querySelectorAll("code")].map((code) => code.textContent);
}

describe("StartHere", () => {
  it("is a labelled aside with the agent setup command and the whole AI prompt", () => {
    const doc = render(<StartHere />);
    const aside = doc.querySelector("aside");
    expect(aside?.getAttribute("aria-label")).toBe("title");
    expect(commands(doc)).toContain(AGENT_INIT_COMMAND);
    expect(aside?.querySelector("figure p")?.textContent).toBe(AI_SETUP_PROMPT);
  });

  it("gives the command and the prompt a copy button each", () => {
    const labels = [...render(<StartHere />).querySelectorAll("button")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["copyAgentAria", "copyPromptAria"]);
  });

  it("shows the same agent command as the install box on the landing and the docs home", () => {
    const banner = commands(render(<StartHere />));
    const installBox = commands(render(<PackageInstall />));
    expect(banner).toEqual([AGENT_INIT_COMMAND]);
    expect(installBox).toContain(AGENT_INIT_COMMAND);
  });

  it("stays at the prose measure, outside the prose styles, with no script of its own", () => {
    const aside = render(<StartHere />).querySelector("aside");
    expect(aside?.classList.contains("not-prose")).toBe(true);
    expect(aside?.classList.contains("max-w-(--width-measure)")).toBe(true);
    expect(aside?.querySelector("script")).toBeNull();
  });
});
