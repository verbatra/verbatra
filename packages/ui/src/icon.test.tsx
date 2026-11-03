// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Icon, type IconName } from "./icon.tsx";
import { render } from "./test-support.tsx";

const ICON_NAME_SET: Readonly<Record<IconName, true>> = {
  activity: true,
  diff: true,
  review: true,
  gauge: true,
  lock: true,
  history: true,
  search: true,
  sun: true,
  moon: true,
  monitor: true,
  menu: true,
  close: true,
  panel: true,
  "chevron-down": true,
  check: true,
  copy: true,
  inbox: true,
  settings: true,
  alert: true,
  book: true,
  help: true,
  globe: true,
  key: true,
  zap: true,
};

const ICON_NAMES = Object.keys(ICON_NAME_SET) as readonly IconName[];

const SHAPE_TAGS = new Set(["path", "circle", "rect", "polyline", "polygon"]);

describe("Icon", () => {
  it.each(ICON_NAMES)("draws the %s glyph as an svg with at least one shape", (name) => {
    const view = render(<Icon name={name} />);
    const svg = view.get("svg");

    expect(svg.childElementCount).toBeGreaterThan(0);
  });

  it.each(ICON_NAMES)("draws the %s glyph only from known shape elements", (name) => {
    const view = render(<Icon name={name} />);
    const tags = [...view.get("svg").children].map((child) => child.tagName);

    expect(tags.every((tag) => SHAPE_TAGS.has(tag))).toBe(true);
  });

  it.each(ICON_NAMES)("hides the %s glyph from assistive technology", (name) => {
    const view = render(<Icon name={name} />);

    expect(view.get("svg").getAttribute("aria-hidden")).toBe("true");
  });

  it.each(ICON_NAMES)(
    "renders no text for the %s glyph, so it adds nothing to the name",
    (name) => {
      const view = render(<Icon name={name} />);

      expect(view.text()).toBe("");
    },
  );

  it("renders every name to a distinct drawing, so no two icons collide on one glyph", () => {
    const drawings = ICON_NAMES.map((name) => render(<Icon name={name} />).get("svg").innerHTML);

    expect(new Set(drawings).size).toBe(ICON_NAMES.length);
  });

  it("renders at 16 pixels square by default", () => {
    const view = render(<Icon name="check" />);
    const svg = view.get("svg");

    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("height")).toBe("16");
  });

  it("renders at the requested size, keeping the square aspect", () => {
    const view = render(<Icon name="check" size={20} />);
    const svg = view.get("svg");

    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("height")).toBe("20");
  });

  it("keeps the 24-unit view box at every size, so a resized glyph is not clipped", () => {
    const view = render(<Icon name="check" size={32} />);

    expect(view.get("svg").getAttribute("viewBox")).toBe("0 0 24 24");
  });

  it("takes its color from the surrounding text rather than a baked-in fill", () => {
    const view = render(<Icon name="alert" />);
    const svg = view.get("svg");

    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("fill")).toBe("none");
  });

  it("applies a caller className, which is how a caller positions or tints the glyph", () => {
    const view = render(<Icon name="search" className="text-(--text-muted)" />);

    expect(view.get("svg").getAttribute("class")).toBe("text-(--text-muted)");
  });

  it("sets no class attribute when the caller passes none", () => {
    const view = render(<Icon name="search" />);

    expect(view.get("svg").hasAttribute("class")).toBe(false);
  });
});
