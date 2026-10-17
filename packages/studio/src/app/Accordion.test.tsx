// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Accordion, AccordionItem } from "./Accordion.js";
import { render } from "./test-support.js";

describe("Accordion", () => {
  it("stacks the items it was handed", () => {
    const view = render(
      <Accordion>
        <AccordionItem summary="first">one</AccordionItem>
        <AccordionItem summary="second">two</AccordionItem>
      </Accordion>,
    );

    expect(view.all("details")).toHaveLength(2);
  });

  it("spaces the items in a vertical column", () => {
    const view = render(<Accordion>content</Accordion>);
    const className = view.get("div").className;

    expect(className).toContain("flex-col");
    expect(className).toContain("gap-3");
  });

  it("lets each item keep its own open state, so opening one never closes another", () => {
    const view = render(
      <Accordion>
        <AccordionItem summary="first" defaultOpen>
          one
        </AccordionItem>
        <AccordionItem summary="second" defaultOpen>
          two
        </AccordionItem>
      </Accordion>,
    );
    const items = view.all("details");

    expect(items[0]?.hasAttribute("open")).toBe(true);
    expect(items[1]?.hasAttribute("open")).toBe(true);
  });
});

describe("AccordionItem", () => {
  it("builds on the native details and summary pair, so the browser supplies the semantics", () => {
    const view = render(<AccordionItem summary="app.title">the body</AccordionItem>);

    expect(view.get("details").tagName).toBe("DETAILS");
    expect(view.get("summary").textContent).toBe("app.title");
  });

  it("renders the body content, which the browser hides until the section is expanded", () => {
    const view = render(<AccordionItem summary="app.title">the body</AccordionItem>);

    expect(view.get("details > div").textContent).toBe("the body");
  });

  it("starts collapsed by default", () => {
    const view = render(<AccordionItem summary="app.title">the body</AccordionItem>);

    expect(view.get("details").hasAttribute("open")).toBe(false);
  });

  it("starts expanded when the caller asks for it", () => {
    const view = render(
      <AccordionItem summary="app.title" defaultOpen>
        the body
      </AccordionItem>,
    );

    expect(view.get("details").hasAttribute("open")).toBe(true);
  });

  it("sets no direction attribute, so its chrome follows the page direction", () => {
    const view = render(<AccordionItem summary="app.title">the body</AccordionItem>);

    expect(view.get("details").hasAttribute("dir")).toBe(false);
  });

  it("hides the browser's default disclosure marker, since the summary brings its own treatment", () => {
    const view = render(<AccordionItem summary="app.title">the body</AccordionItem>);
    const className = view.get("summary").className;

    expect(className).toContain("list-none");
    expect(className).toContain("marker:content-none");
  });

  it("merges a caller className onto the section surface", () => {
    const view = render(
      <AccordionItem summary="app.title" className="mb-2">
        the body
      </AccordionItem>,
    );
    const className = view.get("details").className;

    expect(className).toContain("mb-2");
    expect(className).toContain("border-border");
  });

  it("accepts a rich summary, not just a string", () => {
    const view = render(<AccordionItem summary={<code>app.title</code>}>the body</AccordionItem>);

    expect(view.get("summary code").textContent).toBe("app.title");
  });
});
