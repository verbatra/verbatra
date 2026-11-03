// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Card } from "./card.tsx";
import { render } from "./test-support.tsx";

describe("Card", () => {
  it("renders a plain div by default, so a card is not a landmark unless asked", () => {
    const view = render(<Card>Body</Card>);

    expect(view.get("div > div").tagName).toBe("DIV");
    expect(view.query("section")).toBeNull();
  });

  it("renders a section when the card is a landmark with its own heading", () => {
    const view = render(
      <Card as="section">
        <h2>Locales</h2>
      </Card>,
    );

    expect(view.get("section").tagName).toBe("SECTION");
  });

  it("applies the medium padding by default", () => {
    const view = render(<Card>Body</Card>);
    const card = view.get("div > div");

    expect(card.dataset.padding).toBe("md");
    expect(card.className.split(" ")).toContain("p-6");
  });

  it("applies the small padding on request", () => {
    const names = render(<Card padding="sm">Body</Card>)
      .get("div > div")
      .className.split(" ");

    expect(names).toContain("p-4");
    expect(names).not.toContain("p-6");
  });

  it("adds no padding at all for flush content such as an edge-to-edge table", () => {
    const card = render(<Card padding="none">Body</Card>).get("div > div");

    expect(card.dataset.padding).toBe("none");
    expect(card.className).not.toMatch(/(?:^|\s)p-\d/);
  });

  it("keeps the tile surface in every padding mode", () => {
    const className = render(<Card padding="none">Body</Card>).get("div > div").className;

    expect(className).toContain("border-(--border-tile)");
    expect(className).toContain("bg-(--surface-tile)");
  });

  it("merges a caller className onto the surface classes", () => {
    const view = render(<Card className="mb-6">Body</Card>);

    expect(view.get("div > div").className.split(" ")).toContain("mb-6");
  });

  it("forwards native div attributes, so a caller can make the card a live region", () => {
    const view = render(
      <Card role="status" aria-live="polite">
        Saved
      </Card>,
    );
    const card = view.get("[role=status]");

    expect(card.getAttribute("aria-live")).toBe("polite");
    expect(card.textContent).toBe("Saved");
  });
});
