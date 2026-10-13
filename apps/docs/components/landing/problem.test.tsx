// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CHECK_LOCALE_LINE, CHECK_MISSING_KEYS, CHECK_RUN_LINES } from "@/lib/check-demo";
import { GATE_SOURCE_VALUES } from "@/lib/gate-demo";
import {
  PROBLEM_CHECK_LINES,
  PROBLEM_SOURCE_FILE,
  PROBLEM_TARGET_FILE,
} from "@/lib/landing-problem";
import en from "@/messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});

const { Problem } = await import("./problem");

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await Problem());
});

function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, child]) => Object.assign(acc, flatten(child, prefix ? `${prefix}.${key}` : key)),
    {},
  );
}

function fileText(file: typeof PROBLEM_SOURCE_FILE): string {
  return file.lines
    .filter((line) => !line.missing)
    .map((line) => line.text)
    .join("\n");
}

describe("problem artifacts", () => {
  it("shows the source file holding every demo key", () => {
    expect(flatten(JSON.parse(fileText(PROBLEM_SOURCE_FILE)))).toEqual(GATE_SOURCE_VALUES);
  });

  it("shows a target file that lacks exactly the keys check reports missing", () => {
    const target = flatten(JSON.parse(fileText(PROBLEM_TARGET_FILE)));
    const missing = Object.keys(GATE_SOURCE_VALUES).filter((key) => !(key in target));
    expect(missing).toEqual(CHECK_MISSING_KEYS);
    expect(PROBLEM_TARGET_FILE.lines.filter((line) => line.missing).map((l) => l.missing)).toEqual(
      CHECK_MISSING_KEYS,
    );
  });

  it("prints the real check transcript", () => {
    expect(PROBLEM_CHECK_LINES).toBe(CHECK_RUN_LINES);
    expect(CHECK_LOCALE_LINE).toContain(`${CHECK_MISSING_KEYS.length} missing`);
  });
});

describe("Problem", () => {
  it("lets the keyboard reach and scroll every sideways-scrolling block, each a named group, never a landmark, and end-faded", () => {
    const blocks = [...root.querySelectorAll<HTMLElement>(".vk-scroll-fade")];
    expect(blocks.length).toBeGreaterThan(0);
    expect(root.querySelectorAll("section").length).toBeLessThanOrEqual(1);
    for (const block of blocks) {
      expect(block.tagName).toBe("DIV");
      expect(block.getAttribute("role")).toBe("group");
      expect(block.getAttribute("tabindex")).toBe("0");
      const name = root.querySelector(`#${block.getAttribute("aria-labelledby")}`)?.textContent;
      expect(name?.trim()).not.toBe("");
    }
    expect(root.querySelector(".overflow-x-auto")).toBeNull();
  });

  it("renders the heading, lead and the three problems from en.json", () => {
    const heading = root.querySelector("h2#problem-heading");
    expect(heading?.textContent).toBe(en.landing.problem.heading);
    expect(root.textContent).toContain(en.landing.problem.lead);
    const titles = [...root.querySelectorAll("li h3")].map((node) => node.textContent);
    expect(titles).toEqual([
      en.landing.problem.items.missing.title,
      en.landing.problem.items.wholeFile.title,
      en.landing.problem.items.placeholders.title,
    ]);
    expect(root.querySelector("section")?.id).toBe("problem");
  });

  it("captions both locale files and marks the missing key with the translated mark word", () => {
    const captions = [...root.querySelectorAll("figcaption")].map((node) => node.textContent);
    expect(captions).toEqual([PROBLEM_SOURCE_FILE.path, PROBLEM_TARGET_FILE.path]);
    const missing = root.querySelector("[data-missing]");
    expect(missing?.textContent).toBe(
      `${en.landing.showcase.tryIt.marks.missing}${CHECK_MISSING_KEYS[0]}`,
    );
  });

  it("draws placeholders as chips and the check output in English", () => {
    expect(root.querySelector(".vk-placeholder")?.textContent).toBe("{count}");
    const output = root.querySelector("[data-check-output]");
    expect(output?.getAttribute("lang")).toBe("en");
    expect(output?.textContent).toBe(`$ ${CHECK_RUN_LINES.join("")}`);
  });

  it("keeps the drift artifact at its own height instead of stretching it to the list beside it", () => {
    const artifact = root.querySelector('[data-reveal="2"]');
    expect(artifact?.className.split(" ")).toContain("self-start");
  });

  it("starts the lead on the same column as the list of problems", () => {
    expect(root.querySelector(".vk-section-head")?.getAttribute("data-layout")).toBe("split");
    expect(root.querySelector("ul")?.className).toContain("lg:col-start-9");
  });

  it("reveals the artifact, then the list, and never the heading", () => {
    const marks = [...root.querySelectorAll("[data-reveal]")].map((node) =>
      node.getAttribute("data-reveal"),
    );
    expect(marks).toEqual(["2", "3"]);
  });
});
