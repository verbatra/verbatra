"use client";

import type { ReactNode } from "react";
import { Accordion } from "@/components/ui/shadcn/accordion";
import { trackUmamiEvent } from "@/lib/umami";

function trackOpen(value: string): void {
  if (value) trackUmamiEvent("open-faq", { question: value, location: "faq" });
}

export function FaqAccordion({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Accordion type="single" collapsible onValueChange={trackOpen} className={className}>
      {children}
    </Accordion>
  );
}
