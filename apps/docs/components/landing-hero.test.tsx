// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "en",
}));
vi.mock("@/components/landing/hero-demo", () => ({ HeroDemo: () => <figure data-part="demo" /> }));
vi.mock("@/components/landing/hero-facts", () => ({ HeroFacts: () => <dl data-part="facts" /> }));
vi.mock("@/components/ai-setup-prompt", () => ({
  PromptCopyButton: () => <button type="button" data-part="cta-prompt" />,
}));
type CommandRowProps = {
  command: string;
  label: string;
  event: string;
  wrapsWhenNarrow?: boolean;
  link?: { token: string; href: string };
};

const commandRowProps: CommandRowProps[] = [];

vi.mock("@/components/command-row", () => ({
  CommandRow: (props: CommandRowProps) => {
    commandRowProps.push(props);
    return (
      <code data-part="command">
        {props.command}
        <button type="button" data-command-copy="" />
      </code>
    );
  },
}));

const { LandingHero } = await import("./landing-hero");

const GLOBAL_CSS = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

function keyframes(name: string): string {
  const match = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(GLOBAL_CSS);
  if (!match) throw new Error(`@keyframes ${name} not found`);
  return match[1] as string;
}

async function renderHero(): Promise<Document> {
  const markup = renderToStaticMarkup(await LandingHero());
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("LandingHero: largest contentful paint", () => {
  it("keeps the headline and lead out of the fading rise", async () => {
    const doc = await renderHero();
    for (const selector of ["h1", "p.vk-lead"]) {
      const element = doc.querySelector(selector);
      expect(element, selector).not.toBeNull();
      expect(element?.closest(".vk-rise"), selector).toBeNull();
      expect(element?.closest(".vk-rise-settle"), selector).not.toBeNull();
    }
  });

  it("settles by transform only, so the text is painted from the first frame", () => {
    expect(keyframes("vk-rise-settle")).not.toMatch(/opacity/);
    expect(keyframes("vk-rise")).toMatch(/opacity: 0/);
  });
});

describe("LandingHero: centered stack", () => {
  it("orders headline, lead, the two calls to action, the install command, facts and demo", async () => {
    const doc = await renderHero();
    const parts = Array.from(
      doc.querySelectorAll('h1, p.vk-lead, a[href$="/docs/quickstart"], [data-part]'),
    ).map((element) =>
      element.matches("a")
        ? "cta-start"
        : (element.getAttribute("data-part") ?? element.tagName.toLowerCase()),
    );
    expect(parts).toEqual(["h1", "p", "cta-start", "cta-prompt", "command", "facts", "demo"]);
  });

  it("offers exactly two calls to action, with no GitHub link beside them", async () => {
    const doc = await renderHero();
    const actions = doc.querySelector(".vk-hero-actions");
    const controls = [...(actions?.querySelectorAll("a, button") ?? [])].filter(
      (control) => control.closest('[data-hero-part="command"]') === null,
    );
    expect(controls.map((control) => control.getAttribute("data-part") ?? "cta-start")).toEqual([
      "cta-start",
      "cta-prompt",
    ]);
    expect(doc.querySelector('a[href*="github.com"]')).toBeNull();
  });

  it("shows the one install command instead of the install box", async () => {
    commandRowProps.length = 0;
    const doc = await renderHero();
    const commands = doc.querySelectorAll('[data-part="command"]');
    expect(commands).toHaveLength(1);
    expect(commands[0]?.textContent).toBe(NPM_INSTALL_COMMAND);
    expect(commandRowProps).toHaveLength(1);
    expect(commandRowProps[0]?.wrapsWhenNarrow).toBe(true);
    expect(commandRowProps[0]?.label).toBe("copyAria");
    expect(commandRowProps[0]?.event).toBe("copy-install-command");
  });

  it("gives the install row and the call to action row one shared width", async () => {
    const doc = await renderHero();
    expect(doc.querySelector(".vk-hero-actions > .vk-hero-cta-row")).not.toBeNull();
    expect(doc.querySelector('.vk-hero-actions > [data-hero-part="command"]')?.className).toContain(
      "vk-hero-command",
    );
    const rule = (selector: string) =>
      new RegExp(`\\${selector} \\{([^}]*)\\}`).exec(GLOBAL_CSS)?.[1] ?? "";
    expect(rule(".vk-hero-cta-row")).toContain("max-width: var(--width-hero-actions);");
    expect(rule(".vk-hero-command")).toContain("max-width: var(--width-hero-actions);");
  });

  it("centers the prompt preview under the call to action row, capped by the hero card, never by 100vw", () => {
    const css = GLOBAL_CSS.replace(/\s+/g, " ");
    expect(css).toContain(
      ".vk-hero-cta-row .vk-prompt-pop { inset-inline-start: 50%; width: min(var(--width-prompt-pop), calc(100cqw - 2rem)); translate: -50% 0; }",
    );
    expect(/\.vk-hero-surface \{([^}]*)\}/.exec(GLOBAL_CSS)?.[1]).toContain(
      "container: vk-hero / inline-size;",
    );
    expect(GLOBAL_CSS).not.toContain("100vw");
    expect(css).toContain(".vk-hero-cta-row .vk-prompt { position: static; }");
  });

  it("stacks the hero card above the demo, so the prompt preview is never painted under it", () => {
    const rule = /\.vk-hero-surface \{([^}]*)\}/.exec(GLOBAL_CSS)?.[1] ?? "";
    expect(rule).toContain("z-index: 1;");
    expect(rule).toContain("isolation: isolate;");
  });

  it("drifts the wash by transform on its own layer, never by background position", async () => {
    const doc = await renderHero();
    expect(doc.querySelector(".vk-hero-surface > .vk-hero-wash")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(keyframes("vk-hero-drift")).toMatch(/transform/);
    expect(keyframes("vk-hero-drift")).not.toMatch(/background-position/);
    const css = GLOBAL_CSS.replace(/\s+/g, " ");
    expect(css).toContain(
      "@media (prefers-reduced-motion: no-preference) { .vk-hero-wash::before { animation: vk-hero-drift",
    );
  });

  it("keeps the demo out of the hero card, so the card ends above the fold", async () => {
    const doc = await renderHero();
    const card = doc.querySelector(".vk-hero-surface");
    expect(card?.querySelector("h1")).not.toBeNull();
    expect(card?.querySelector('[data-part="facts"]')).not.toBeNull();
    expect(card?.querySelector('[data-part="demo"]')).toBeNull();
  });

  it("sets the headline in the hero type and the lead in mono", () => {
    const rule = (selector: string) =>
      new RegExp(`\\${selector} \\{([^}]*)\\}`).exec(GLOBAL_CSS)?.[1] ?? "";
    expect(rule(".vk-hero-title")).toContain("font-size: var(--text-hero)");
    expect(rule(".vk-hero-title")).toContain("line-height: var(--leading-hero)");
    expect(rule(".vk-hero-title")).toContain("font-weight: 500");
    expect(rule(".vk-hero-lead")).toContain("font-family: var(--font-mono)");
    expect(rule(".vk-hero-cta")).toContain("min-height: var(--cta-height)");
  });

  it("centers the headline column", async () => {
    const doc = await renderHero();
    expect(doc.querySelector("h1")?.closest(".text-center")).not.toBeNull();
  });
});
