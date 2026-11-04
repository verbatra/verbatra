// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader.js";
import { render } from "./test-support.js";

describe("PageHeader", () => {
  it("puts the page title in the single h1", () => {
    const view = render(<PageHeader title="Translations" />);

    expect(view.get("h1").textContent).toBe("Translations");
  });

  it("renders no eyebrow line unless the caller gives one", () => {
    const view = render(<PageHeader title="Translations" />);

    expect(view.query("p")).toBeNull();
  });

  it("takes a more specific eyebrow line when the caller gives one", () => {
    const view = render(<PageHeader kicker="Review queue" title="Pending" />);

    expect(view.get("p").textContent).toBe("Review queue");
  });

  it("renders the description line when there is one", () => {
    const view = render(
      <PageHeader title="Translations" description="Every key across every target locale." />,
    );
    const lines = view.all("p");

    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toBe("Every key across every target locale.");
  });

  it("renders no description line when the caller passes none", () => {
    const view = render(<PageHeader title="Translations" />);

    expect(view.all("p")).toHaveLength(0);
  });

  it("renders the actions slot at the inline end of the header", () => {
    const view = render(
      <PageHeader title="Translations" actions={<button type="button">Refresh</button>} />,
    );

    expect(view.get("button").textContent).toBe("Refresh");
    expect(view.all("div")).toHaveLength(2);
  });

  it("renders no actions group when there are no actions, so nothing empty takes up space", () => {
    const view = render(<PageHeader title="Translations" />);

    expect(view.all("div")).toHaveLength(1);
  });

  it("renders as a header element, so the block is a recognizable page banner", () => {
    const view = render(<PageHeader title="Translations" />);

    expect(view.get("header").tagName).toBe("HEADER");
  });

  it("renders a meta row under the description when there is one", () => {
    const view = render(<PageHeader title="Glossary" meta={<span>Source: file</span>} />);

    expect(view.getByText("span", "Source: file")).not.toBeNull();
  });

  it("renders no meta row unless the caller gives one", () => {
    const view = render(<PageHeader title="Glossary" />);

    expect(view.query("header div div")).toBeNull();
  });

  it("lets the actions wrap so a narrow screen never scrolls sideways", () => {
    const view = render(
      <PageHeader title="Translations" actions={<button type="button">Go</button>} />,
    );

    expect(view.get("header button").parentElement?.className).toContain("flex-wrap");
  });
});
