"use client";

import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/shadcn/accordion";
import { trackUmamiEvent } from "@/lib/umami";

export type FaqAccordionItem = {
  readonly id: string;
  readonly question: string;
  readonly content: ReactNode;
};

const ITEM_CLASS =
  "border-b border-fd-border [&[data-state=closed]>[data-slot=accordion-content]]:hidden";

const TRIGGER_CLASS =
  "items-center py-5 text-(length:--text-h4) font-semibold text-fd-foreground hover:text-[color:var(--accent)] hover:no-underline data-[state=open]:text-[color:var(--accent)] [&>svg]:size-5 [&>svg]:translate-y-0 [&>svg]:text-[color:var(--accent)] motion-reduce:[&>svg]:transition-none";

function trackOpen(value: string): void {
  if (value) trackUmamiEvent("open-faq", { question: value, location: "faq" });
}

export function FaqAccordion({
  className,
  items,
}: {
  className: string;
  items: ReadonlyArray<FaqAccordionItem>;
}): ReactNode {
  return (
    <Accordion type="single" collapsible onValueChange={trackOpen} className={className}>
      {items.map((item) => (
        <AccordionItem key={item.id} value={item.id} data-faq={item.id} className={ITEM_CLASS}>
          <AccordionTrigger className={TRIGGER_CLASS} style={{ fontFamily: "var(--font-display)" }}>
            {item.question}
          </AccordionTrigger>
          <AccordionContent forceMount className="pb-5">
            <p className="max-w-[68ch] text-base leading-relaxed text-fd-muted-foreground">
              {item.content}
            </p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
