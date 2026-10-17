// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Button } from "./Button.js";
import { TranslationValue, valueDirection } from "./TranslationValue.js";
import { render } from "./test-support.js";

describe("valueDirection", () => {
  it.each([
    ["ar", "rtl"],
    ["ps", "rtl"],
    ["yi", "rtl"],
    ["de", "ltr"],
    [undefined, "auto"],
  ] as const)("resolves %s to %s", (locale, expected) => {
    expect(valueDirection(locale)).toBe(expected);
  });
});

describe("valueDirection: per value", () => {
  it.each([
    ["ps", "Checkout", "auto"],
    ["ps", "{count} items", "auto"],
    ["ar", "الدفع {amount}", "rtl"],
    ["he", "שלום", "rtl"],
    ["de", "مرحبا", "ltr"],
  ] as const)("resolves a %s value %s to %s", (locale, value, expected) => {
    expect(valueDirection(locale, value)).toBe(expected);
  });
});

describe("TranslationValue", () => {
  it("tags the value with its locale and lets an untranslated echo in an RTL locale read left to right", () => {
    const view = render(<TranslationValue value="Checkout" locale="ps" />);

    expect(view.get("span").getAttribute("lang")).toBe("ps");
    expect(view.get("span").getAttribute("dir")).toBe("auto");
  });

  it("sets the value element's direction from its locale", () => {
    const view = render(<TranslationValue value="مرحبا" locale="ar" />);

    expect(view.get("span").getAttribute("dir")).toBe("rtl");
    expect(view.get("span").className).toContain("text-start");
  });

  it("falls back to automatic direction when no locale is known", () => {
    const view = render(<TranslationValue value="Hello" />);

    expect(view.get("span").getAttribute("dir")).toBe("auto");
  });

  it("wraps each placeholder, ICU and markup token in a left-to-right isolate and keeps the text intact", () => {
    const value = "طلب #{orderId} <b>جاهز</b> {n, plural, one {#} other {#}}";
    const view = render(<TranslationValue value={value} locale="ar" />);
    const tokens = view.all("bdi");

    expect(view.text()).toBe(value);
    expect(tokens.map((node) => node.textContent)).toEqual([
      "#{orderId}",
      "<b>",
      "</b>",
      "{n, plural,",
      "one {",
      "#",
      "} other {",
      "#",
      "}",
      "}",
    ]);
    expect(tokens.every((node) => node.getAttribute("dir") === "ltr")).toBe(true);
  });

  it("leaves the text inside ICU arms outside any isolate so it follows the value's direction", () => {
    const value = "{count, plural, one {# ورځ} other {# ورځې}}";
    const view = render(<TranslationValue value={value} locale="ps" />);
    const span = view.get("span");
    const armTexts = Array.from(span.childNodes)
      .filter((node) => node.nodeType === node.TEXT_NODE)
      .map((node) => node.textContent);

    expect(span.getAttribute("dir")).toBe("rtl");
    expect(view.text()).toBe(value);
    expect(armTexts).toEqual([" ", " ورځ", " ورځې"]);
    expect(view.all("bdi")[0]?.textContent).toBe("{count, plural,");
  });

  it("renders as a paragraph when asked and forwards title, class and data attributes", () => {
    const view = render(
      <TranslationValue
        as="p"
        value="Hallo"
        locale="de"
        className="truncate"
        title="Hallo"
        data-row-value=""
      />,
    );
    const element = view.get("p");

    expect(element.getAttribute("dir")).toBe("ltr");
    expect(element.getAttribute("title")).toBe("Hallo");
    expect(element.hasAttribute("data-row-value")).toBe(true);
    expect(element.className).toContain("truncate");
  });

  it("keeps each syntax token on one line so a brace never starts a line on its own", () => {
    const view = render(
      <TranslationValue value="{n, plural, zero {لا} few {#} other {#}}" locale="ar" />,
    );
    const tokens = view.all("bdi");

    expect(tokens.map((node) => node.textContent)).toContain("} few {");
    expect(tokens.every((node) => node.className.split(" ").includes("whitespace-nowrap"))).toBe(
      true,
    );
  });

  it("lets a paragraph value scroll sideways so a token longer than its container stays inside it", () => {
    const longToken = `#{${"x".repeat(200)}}`;
    const view = render(<TranslationValue as="p" value={`طلب ${longToken}`} locale="ar" />);

    expect(view.get("p").className.split(" ")).toContain("overflow-x-auto");
    expect(view.get("bdi").textContent).toBe(longToken);
  });

  it("draws the focus ring of a button on a paragraph value a keyboard can scroll", () => {
    const focusClasses = (element: Element): readonly string[] =>
      element.className.split(" ").filter((name) => name.startsWith("focus-visible:"));
    const value = render(<TranslationValue as="p" value="{name}" />);
    const button = render(<Button>Edit</Button>);

    expect(focusClasses(value.get("p"))).toEqual(focusClasses(button.get("button")));
    expect(focusClasses(value.get("p"))).toContain("focus-visible:outline-ring");
  });

  it("leaves an inline value's overflow to its caller", () => {
    const view = render(<TranslationValue value="{name}" className="truncate" />);

    expect(view.get("span").className).not.toContain("overflow-x-auto");
    expect(view.get("span").className).not.toContain("focus-visible");
  });

  it("marks the tokens visually only when asked to highlight them", () => {
    const plain = render(<TranslationValue value="Hi {name}" />);
    const highlighted = render(<TranslationValue value="Hi {name}" highlightTokens />);

    expect(plain.get("bdi").className).toBe("whitespace-nowrap");
    expect(highlighted.get("bdi").className).toContain("bg-accent");
    expect(highlighted.text()).toBe("Hi {name}");
  });
});
