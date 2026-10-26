// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  HERO_TERMINAL_NEW_KEYS,
  HERO_TERMINAL_SYNCED_KEYS,
  HERO_TRANSLATE_OUTPUT,
} from "@/lib/hero-terminal";
import en from "@/messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});

const { Statement } = await import("./statement");

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await Statement());
});

describe("Statement", () => {
  it("names the section by its one heading, under a bracketed label", () => {
    const section = root.querySelector("section#statement");
    expect(section?.getAttribute("aria-labelledby")).toBe("statement-heading");
    expect(root.querySelectorAll("h2")).toHaveLength(1);
    expect(root.querySelector("p.vk-eyebrow")?.textContent).toBe(en.landing.statement.label);
  });

  it("takes both counts from the hero run, lighting only the keys that leave the machine", () => {
    const heading = root.querySelector("h2#statement-heading");
    const lit = heading?.querySelector("em.vk-statement-lit")?.textContent ?? "";
    expect(lit).toContain(String(HERO_TERMINAL_NEW_KEYS.length));
    expect(lit).toBe(`${HERO_TERMINAL_NEW_KEYS.length} keys`);
    expect(lit).not.toContain(String(HERO_TERMINAL_SYNCED_KEYS.length));
    expect(heading?.textContent).toContain(String(HERO_TERMINAL_SYNCED_KEYS.length));
  });

  it("proves the sentence with the first locale line of the same run", () => {
    expect(root.querySelector(".vk-statement-proof")?.textContent).toBe(
      HERO_TRANSLATE_OUTPUT[1]?.trim(),
    );
    expect(root.querySelector(".vk-statement-proof")?.getAttribute("lang")).toBe("en");
  });
});
