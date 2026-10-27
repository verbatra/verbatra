// @vitest-environment jsdom

import { CalloutContainer } from "fumadocs-ui/components/callout";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";

const getTranslations = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({ getTranslations }));
getTranslations.mockImplementation(
  async () => (key: string) => (key === "note" ? "Hinweis" : "Warnung"),
);

const { DocsCallout } = await import("./docs-callout");

type Props = Omit<ComponentProps<typeof DocsCallout>, "locale" | "children">;

async function render(props: Props): Promise<Document> {
  const markup = renderToStaticMarkup(
    await DocsCallout({ locale: "de", ...props, children: <p>Body text</p> }),
  );
  return new DOMParser().parseFromString(markup, "text/html");
}

const calloutRules = docsStylesheetRules().filter((rule) => rule.selector.includes(".vk-callout"));

describe("DocsCallout", () => {
  it("reads its lead words from the docs.callout namespace", async () => {
    await render({});
    expect(getTranslations).toHaveBeenCalledWith({ locale: "de", namespace: "docs.callout" });
  });

  it("gives an untitled info callout the localized note lead word in its own title element", async () => {
    const doc = await render({});
    expect(doc.querySelector(".vk-callout")).not.toBeNull();
    expect(doc.querySelector("p.vk-callout-title")?.textContent).toBe("Hinweis");
  });

  it.each(["warn", "warning"] as const)(
    "gives an untitled %s callout the warning lead word",
    async (type) => {
      expect((await render({ type })).querySelector(".vk-callout-title")?.textContent).toBe(
        "Warnung",
      );
    },
  );

  it("keeps a title the author wrote", async () => {
    const doc = await render({ type: "warn", title: "Two different maxTokens" });
    expect(doc.querySelector(".vk-callout-title")?.textContent).toBe("Two different maxTokens");
  });

  it("adds no lead word to a type that has none", async () => {
    expect((await render({ type: "error" })).querySelector(".vk-callout-title")).toBeNull();
  });

  it("styles the lead word through the title class alone, never through the body paragraph", async () => {
    const doc = await render({});
    const body = doc.querySelector(".vk-callout-body p");
    expect(body).not.toBeNull();
    for (const rule of calloutRules.filter(
      (r) => r.declarations.color === "var(--callout-color)",
    )) {
      expect(body?.matches(rule.selector), rule.selector).toBe(false);
    }
  });

  it("leaves the paragraphs of a bare callout container, like the privacy objection, unstyled as lead words", () => {
    const markup = renderToStaticMarkup(
      <CalloutContainer type="info" className="vk-callout">
        <h2>Objection</h2>
        <p className="mb-0">Body</p>
      </CalloutContainer>,
    );
    const doc = new DOMParser().parseFromString(markup, "text/html");
    const paragraph = doc.querySelector("p.mb-0");
    for (const rule of calloutRules) {
      if (
        rule.declarations["font-weight"] === "600" ||
        rule.declarations.color === "var(--callout-color)"
      ) {
        expect(paragraph?.matches(rule.selector), rule.selector).toBe(false);
      }
    }
  });
});
