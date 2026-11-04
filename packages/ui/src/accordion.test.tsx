// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Accordion, AccordionItem } from "./accordion.tsx";
import { render } from "./test-support.tsx";

describe("Accordion", () => {
  it("stacks the items it was handed, each keeping its own open state", () => {
    const view = render(
      <Accordion>
        <AccordionItem summary="One" defaultOpen>
          a
        </AccordionItem>
        <AccordionItem summary="Two">b</AccordionItem>
      </Accordion>,
    );
    const items = view.all("details");

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.hasAttribute("open"))).toEqual([true, false]);
  });
});

describe("AccordionItem", () => {
  it("builds on the native details and summary pair", () => {
    const view = render(<AccordionItem summary="Title">Body</AccordionItem>);

    expect(view.get("details > summary").textContent).toBe("Title");
    expect(view.text()).toContain("Body");
  });

  it("starts collapsed unless asked to open", () => {
    expect(
      render(<AccordionItem summary="T">B</AccordionItem>)
        .get("details")
        .hasAttribute("open"),
    ).toBe(false);
    expect(
      render(
        <AccordionItem summary="T" defaultOpen>
          B
        </AccordionItem>,
      )
        .get("details")
        .hasAttribute("open"),
    ).toBe(true);
  });

  it("sets no direction attribute, so it follows the page direction", () => {
    const view = render(<AccordionItem summary="T">B</AccordionItem>);

    expect(view.get("details").hasAttribute("dir")).toBe(false);
  });

  it("gives its summary the shared focus hook and accepts a rich summary", () => {
    const view = render(
      <AccordionItem summary={<em>Rich</em>} className="mb-2">
        B
      </AccordionItem>,
    );

    expect(view.get("summary").className.split(" ")).toContain("vk-field");
    expect(view.get("summary em").textContent).toBe("Rich");
    expect(view.get("details").className.split(" ")).toContain("mb-2");
  });
});
