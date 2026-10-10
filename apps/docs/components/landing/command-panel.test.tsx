// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const trackUmamiEvent = vi.fn();
vi.mock("@/lib/umami", () => ({ trackUmamiEvent }));

const { CommandPanel } = await import("./command-panel");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABELS = {
  tablist: "Set up verbatra",
  install: "Install",
  prompt: "Prompt",
  installHint: "Run this in your project.",
  promptHint: "Paste this into your coding agent.",
};

describe("CommandPanel", () => {
  let mounted: { container: HTMLDivElement; root: Root } | undefined;
  const writeText = vi.fn<(text: string) => Promise<void>>();

  function render(): HTMLDivElement {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<CommandPanel labels={LABELS} />);
    });
    mounted = { container, root };
    return container;
  }

  function tabs(container: HTMLElement): HTMLButtonElement[] {
    return [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  }

  function panels(container: HTMLElement): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
  }

  function visiblePanel(container: HTMLElement): HTMLElement | undefined {
    return panels(container).find((panel) => panel.dataset.active === "true");
  }

  async function press(target: HTMLElement, key: string): Promise<void> {
    await act(async () => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  }

  async function click(target: Element | null | undefined): Promise<void> {
    await act(async () => {
      target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    trackUmamiEvent.mockReset();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    if (mounted) {
      const { container, root } = mounted;
      act(() => root.unmount());
      container.remove();
      mounted = undefined;
    }
  });

  it("is a named tablist of Install and Prompt, each tab wired to its panel", () => {
    const container = render();
    expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(
      LABELS.tablist,
    );
    expect(tabs(container).map((tab) => tab.textContent)).toEqual(["Install", "Prompt"]);
    for (const [index, tab] of tabs(container).entries()) {
      const panel = panels(container)[index];
      expect(tab.getAttribute("aria-controls")).toBe(panel?.id);
      expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
    }
  });

  it("opens on Install, the only tab in the tab order, with the npm command", () => {
    const container = render();
    expect(tabs(container).map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
    ]);
    expect(tabs(container).map((tab) => tab.tabIndex)).toEqual([0, -1]);
    expect(visiblePanel(container)?.querySelector("code")?.textContent).toBe(NPM_INSTALL_COMMAND);
  });

  it("renders both panels in the markup, so the prompt is in the page before any click", () => {
    const container = render();
    expect(panels(container)).toHaveLength(2);
    expect(panels(container)[1]?.dataset.active).toBe("false");
    expect(panels(container)[1]?.hasAttribute("inert")).toBe(true);
    expect(panels(container)[0]?.hasAttribute("inert")).toBe(false);
    expect(panels(container)[1]?.querySelector("pre")?.textContent).toBe(AI_SETUP_PROMPT);
  });

  it("shows only the open pane at every width, so the install pane carries no empty height under its command", () => {
    const container = render();
    expect(
      panels(container).every(
        (panel) => panel.parentElement?.className === "vk-command-panel-body",
      ),
    ).toBe(true);
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8").replace(/\s+/g, " ");
    expect(css).toContain(".vk-command-panel-body { display: grid; }");
    expect(css).toContain('.vk-command-panel-body > [role="tabpanel"] { grid-area: 1 / 1;');
    expect(css).toContain('.vk-command-panel-body > [data-active="false"] { display: none; }');
    expect(css).not.toContain("visibility: hidden; } }");
    expect(css).not.toMatch(/\.vk-command-panel-body > \[data-active="false"\] \{ display: grid;/);
    expect(css).toContain(".vk-command-panel-pane { display: grid; align-content: start;");
  });

  it("gives both panes one shape: a hint with Copy on the right, then the content at full width", () => {
    const container = render();
    const [install, prompt] = panels(container);
    for (const [pane, hint] of [
      [install, LABELS.installHint],
      [prompt, LABELS.promptHint],
    ] as const) {
      expect(pane?.className).toBe("vk-command-panel-pane");
      const head = pane?.firstElementChild;
      expect(head?.querySelector("p")?.textContent).toBe(hint);
      expect(head?.querySelector("button")).not.toBeNull();
    }
    expect(install?.lastElementChild?.querySelector("code")?.textContent).toBe(NPM_INSTALL_COMMAND);
    expect(prompt?.lastElementChild?.tagName).toBe("PRE");
  });

  it("keeps each npx run and --skill verbatra-cli in the prompt on one line", () => {
    const pre = render().querySelector("pre");
    const runs = [...(pre?.querySelectorAll("span.whitespace-nowrap") ?? [])]
      .map((span) => span.textContent)
      .filter((text) => text?.startsWith("npx") || text?.startsWith("--skill"));
    expect(runs).toEqual(["npx -y skills@latest", "--skill verbatra-cli", "npx @verbatra/cli"]);
  });

  it("moves between tabs with the arrow keys, wrapping, focus following selection", async () => {
    const container = render();
    const [install, prompt] = tabs(container);
    if (!install || !prompt) throw new Error("tabs missing");
    install.focus();
    await press(install, "ArrowRight");
    expect(document.activeElement).toBe(tabs(container)[1]);
    expect(tabs(container)[1]?.getAttribute("aria-selected")).toBe("true");
    expect(visiblePanel(container)?.querySelector("pre")?.textContent).toBe(AI_SETUP_PROMPT);
    await press(tabs(container)[1] as HTMLElement, "ArrowRight");
    expect(document.activeElement).toBe(tabs(container)[0]);
    await press(tabs(container)[0] as HTMLElement, "ArrowLeft");
    expect(document.activeElement).toBe(tabs(container)[1]);
    await press(tabs(container)[1] as HTMLElement, "Home");
    expect(document.activeElement).toBe(tabs(container)[0]);
    await press(tabs(container)[0] as HTMLElement, "End");
    expect(document.activeElement).toBe(tabs(container)[1]);
  });

  it("counts a tab switch once per change, never a click on the open tab", async () => {
    const container = render();
    await click(tabs(container)[0]);
    expect(trackUmamiEvent).not.toHaveBeenCalled();
    await click(tabs(container)[1]);
    expect(trackUmamiEvent).toHaveBeenCalledWith("select-tab", { tab: "prompt", location: "hero" });
    await click(tabs(container)[0]);
    expect(trackUmamiEvent).toHaveBeenLastCalledWith("select-tab", {
      tab: "install",
      location: "hero",
    });
  });

  it("copies the install command and counts copy-install-command, the hero's existing event", async () => {
    const container = render();
    await click(visiblePanel(container)?.querySelector("button"));
    expect(writeText).toHaveBeenCalledWith(NPM_INSTALL_COMMAND);
    expect(trackUmamiEvent).toHaveBeenCalledWith("copy-install-command", {
      command: NPM_INSTALL_COMMAND,
      manager: "npm",
      location: "hero",
    });
  });

  it("prints the install command as plain text, with no link inside it to click by mistake", () => {
    const code = visiblePanel(render())?.querySelector("code");
    expect(code?.textContent).toBe(NPM_INSTALL_COMMAND);
    expect(code?.querySelector("a")).toBeNull();
  });

  it("copies the whole prompt, counts copy-ai-prompt and announces it", async () => {
    const container = render();
    await click(tabs(container)[1]);
    const panel = visiblePanel(container);
    await click(panel?.querySelector("button"));
    expect(writeText).toHaveBeenCalledWith(AI_SETUP_PROMPT);
    expect(trackUmamiEvent).toHaveBeenLastCalledWith("copy-ai-prompt", { location: "hero" });
    expect(panel?.querySelector('[aria-live="polite"]')?.textContent).toBe("copied");
  });

  it("shows the failure state and counts nothing when the clipboard refuses", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const container = render();
    await click(tabs(container)[1]);
    trackUmamiEvent.mockReset();
    const panel = visiblePanel(container);
    await click(panel?.querySelector("button"));
    expect(panel?.querySelector("button")?.getAttribute("data-status")).toBe("failed");
    expect(panel?.querySelector('[aria-live="polite"]')?.textContent).toBe("copyFailed");
    expect(trackUmamiEvent).not.toHaveBeenCalled();
    expect(panel?.querySelector("pre")?.textContent).toBe(AI_SETUP_PROMPT);
  });

  it("uses the shared segmented TabList variant rather than its own tab classes", () => {
    const container = render();
    expect(container.querySelector('[role="tablist"]')?.classList.contains("vk-segmented")).toBe(
      true,
    );
    for (const tab of tabs(container))
      expect(tab.className).toContain("rounded-(--radius-segment)");
    const source = readFileSync(
      join(process.cwd(), "components/landing/command-panel.tsx"),
      "utf8",
    );
    expect(source).toContain('variant="segmented"');
    expect(source).not.toMatch(/TAB_CLASS|function panelProps|rounded-\[7px\]/);
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    expect(css).toContain("--radius-segment: 7px;");
  });
});
