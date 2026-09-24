// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
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

describe("TranslationValue", () => {
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
      "{n, plural, one {#} other {#}}",
    ]);
    expect(tokens.every((node) => node.getAttribute("dir") === "ltr")).toBe(true);
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
});
