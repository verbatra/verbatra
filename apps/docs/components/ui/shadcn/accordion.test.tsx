// @vitest-environment jsdom

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

describe("shadcn accordion", () => {
  it("turns the trigger and chevron transitions off under reduced motion", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      <Accordion type="single" collapsible>
        <AccordionItem value="a">
          <AccordionTrigger>Question</AccordionTrigger>
          <AccordionContent>Answer</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    const trigger = container.querySelector("button");
    const chevron = trigger?.querySelector("svg");
    expect(trigger?.classList.contains("motion-reduce:transition-none")).toBe(true);
    expect(chevron?.classList.contains("motion-reduce:transition-none")).toBe(true);
  });
});
