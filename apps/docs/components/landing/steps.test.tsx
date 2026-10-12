// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LANDING_STEP_CODE, LANDING_STEP_IDS } from "@/lib/landing-code";
import en from "@/messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { default: messages } = await import("@/messages/en.json");
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});

const { Steps } = await import("./steps");

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await Steps());
});

describe("Steps", () => {
  it("renders the three steps in order as an ordered list with no visible numbers", () => {
    expect(root.querySelector("h2")?.textContent).toBe(en.landing.steps.heading);
    const items = [...root.querySelectorAll("ol > li")];
    expect(items.map((item) => item.getAttribute("data-step"))).toEqual(LANDING_STEP_IDS);
    expect(items.map((item) => item.querySelector("h3")?.textContent)).toEqual(
      LANDING_STEP_IDS.map((id) => en.landing.steps.items[id].title),
    );
    expect(root.querySelector(".vk-how-step-index, .vk-eyebrow")).toBeNull();
  });

  it("sets backticked commands in code type", () => {
    const body = root.querySelector('[data-step="check"] p');
    expect(body?.querySelector("code")?.textContent).toBe("verbatra check");
    expect(body?.textContent).toBe(en.landing.steps.items.check.body.replaceAll("`", ""));
  });

  it("highlights each step snippet on the server with both themes", () => {
    for (const id of LANDING_STEP_IDS) {
      const frame = root.querySelector(`[data-step="${id}"] figure`);
      expect(frame?.getAttribute("data-code-lang")).toBe(LANDING_STEP_CODE[id].language);
      expect(frame?.querySelector("pre.shiki.github-light.github-dark")).not.toBeNull();
      expect(frame?.innerHTML).toContain("--shiki-dark:");
      expect(frame?.querySelector("code")?.textContent).toBe(
        LANDING_STEP_CODE[id].code.replace(/\n+$/, ""),
      );
    }
  });

  it("gives every snippet a copy button named from en.json", () => {
    const buttons = [...root.querySelectorAll("button")];
    expect(buttons).toHaveLength(LANDING_STEP_IDS.length);
    for (const button of buttons) {
      expect(button.getAttribute("aria-label")).toBe(en.landing.code.copy);
    }
  });
});
