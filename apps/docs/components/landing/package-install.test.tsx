// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const { PackageInstall } = await import("./package-install");

function renderInstall(): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(<PackageInstall />), "text/html");
}

describe("PackageInstall", () => {
  it("shows one npm command, with no package-manager tabs and no switch", () => {
    const doc = renderInstall();
    const commands = [...doc.querySelectorAll("code")].map((code) => code.textContent);
    expect(commands).toEqual([NPM_INSTALL_COMMAND]);
    expect(doc.querySelector('[role="tablist"], [role="tab"], [role="switch"]')).toBeNull();
  });

  it("shows the whole AI prompt under its own caption, never a truncated preview", () => {
    const figure = renderInstall().querySelector("figure");
    expect(figure?.querySelector("figcaption")?.textContent).toBe("aiLabel");
    expect(figure?.querySelector("p")?.textContent).toBe(AI_SETUP_PROMPT);
  });

  it("gives the command and the prompt a copy button each, named for what they copy", () => {
    const labels = [...renderInstall().querySelectorAll("button")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["copyAria", "copyPromptAria"]);
  });
});
