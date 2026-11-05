// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { FilterBar } from "./filter-bar.tsx";
import { render } from "./test-support.tsx";

describe("FilterBar", () => {
  it("groups its controls in a fieldset, so they are announced as one named group", () => {
    const view = render(
      <FilterBar>
        <select aria-label="Locale">
          <option value="de">de</option>
        </select>
      </FilterBar>,
    );

    expect(view.get("fieldset").tagName).toBe("FIELDSET");
    expect(view.get("select")).not.toBeNull();
  });

  it("names the group Filters by default", () => {
    const view = render(<FilterBar>controls</FilterBar>);

    expect(view.get("legend").textContent).toBe("Filters");
  });

  it("takes a more specific group name when the caller gives one", () => {
    const view = render(<FilterBar label="Review filters">controls</FilterBar>);

    expect(view.get("legend").textContent).toBe("Review filters");
  });

  it("hides the legend visually, since the group name is for assistive technology only", () => {
    const view = render(<FilterBar>controls</FilterBar>);

    expect(view.get("legend").className).toContain("sr-only");
  });

  it("drops the browser's default fieldset border and padding", () => {
    const view = render(<FilterBar>controls</FilterBar>);
    const className = view.get("fieldset").className;

    expect(className).toContain("border-0");
    expect(className).toContain("p-0");
  });

  it("merges a caller className onto the fieldset", () => {
    const view = render(<FilterBar className="mb-2">controls</FilterBar>);

    expect(view.get("fieldset").className).toContain("mb-2");
  });

  it("passes other attributes to the fieldset", () => {
    const view = render(
      <FilterBar data-shortcuts-paused="" id="bar">
        controls
      </FilterBar>,
    );

    expect(view.get("fieldset").dataset.shortcutsPaused).toBe("");
    expect(view.get("fieldset").id).toBe("bar");
  });
});
