// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { AGENT_INIT_COMMAND, NPM_INSTALL_COMMAND } from "@/lib/install-commands";

vi.mock("next-intl", () => {
  const t = Object.assign((key: string) => key, {
    rich: (key: string, values: { link: (chunks: string) => unknown }) => values.link(key),
  });
  return { useTranslations: () => t, useLocale: () => "de" };
});

const { PackageInstall } = await import("./package-install");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  window.umami = undefined;
  document.body.innerHTML = "";
});

function renderInstall(): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(<PackageInstall />), "text/html");
}

describe("PackageInstall", () => {
  it("numbers two steps, install then set up, with one npm command and no package-manager tabs", () => {
    const doc = renderInstall();
    const steps = [...doc.querySelectorAll("ol > li")];
    expect(steps.map((step) => step.querySelector(".vk-label")?.textContent)).toEqual([
      "1stepInstall",
      "2stepSetUp",
    ]);
    const commands = [...doc.querySelectorAll("code")].map((code) => code.textContent);
    expect(commands).toEqual([NPM_INSTALL_COMMAND]);
    expect(doc.querySelector('[role="tablist"], [role="tab"], [role="switch"]')).toBeNull();
  });

  it("sends a new project to the localized quickstart, never to init --agent", () => {
    const doc = renderInstall();
    const setUp = doc.querySelectorAll("ol > li")[1];
    expect(setUp?.querySelector("a")?.getAttribute("href")).toBe("/de/docs/quickstart");
    expect(doc.body.textContent).not.toContain(AGENT_INIT_COMMAND);
  });

  it("shows the whole AI prompt under its own caption, never a truncated preview", () => {
    const figure = renderInstall().querySelector("figure");
    expect(figure?.querySelector("figcaption")?.textContent).toBe("agentLabel");
    expect(figure?.querySelector("p")?.textContent).toBe(AI_SETUP_PROMPT);
  });

  it("lets the prompt wrap only at a space or the URL's offered breaks, with Copy in the caption row", () => {
    const figure = renderInstall().querySelector("figure");
    const prompt = figure?.querySelector("p");
    expect(prompt?.className).not.toMatch(/overflow-wrap|break-all|break-words/);
    expect(prompt?.querySelectorAll("wbr").length).toBeGreaterThan(0);
    const captionRow = figure?.querySelector("figcaption")?.parentElement;
    expect(captionRow?.className).not.toMatch(/flex-col/);
    expect(captionRow?.querySelector("button")?.getAttribute("aria-label")).toBe("copyPromptAria");
  });

  it("gives each command and the prompt a copy button, named for what they copy", () => {
    const labels = [...renderInstall().querySelectorAll("button")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["copyAria", "copyPromptAria"]);
  });

  it("sends the copied command text for the command and no data for the prompt", () => {
    const track = vi.fn();
    window.umami = { track };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<PackageInstall />));
    for (const button of container.querySelectorAll("button")) {
      act(() => button.click());
    }
    act(() => root.unmount());
    expect(track.mock.calls).toEqual([
      ["copy-install-command", { command: NPM_INSTALL_COMMAND }],
      ["copy-ai-prompt", undefined],
    ]);
  });
});
