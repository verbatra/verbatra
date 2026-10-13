"use client";

import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/shadcn/accordion";

type FaqAccordionItem = {
  readonly id: string;
  readonly question: string;
  readonly content: ReactNode;
};

const ITEM_CLASS =
  "border-b border-(--border-default) [&[data-state=closed]>[data-slot=accordion-content]]:hidden";

const TRIGGER_CLASS =
  "items-center py-5 text-(length:--text-h4) font-semibold text-(--text-strong) hover:text-(--accent) hover:no-underline data-[state=open]:text-(--accent) [&>svg]:size-5 [&>svg]:translate-y-0 [&>svg]:text-(--accent) motion-reduce:[&>svg]:transition-none";

export function FaqAccordion({
  className,
  items,
}: {
  className: string;
  items: ReadonlyArray<FaqAccordionItem>;
}): ReactNode {
  return (
    <Accordion type="single" collapsible className={className}>
      {items.map((item) => (
        <AccordionItem key={item.id} value={item.id} data-faq={item.id} className={ITEM_CLASS}>
          <AccordionTrigger className={TRIGGER_CLASS} style={{ fontFamily: "var(--font-display)" }}>
            {item.question}
          </AccordionTrigger>
          <AccordionContent forceMount className="pb-5">
            <p className="max-w-[68ch] text-base leading-relaxed text-(--text-muted)">
              {item.content}
            </p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
