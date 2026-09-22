"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { useReducedMotionPreference } from "@/lib/reduced-motion";
import type { FaqItem } from "@/lib/structured-data";
import { RELEASES_URL } from "./links";
import { Reveal } from "./reveal";
import { SectionHead } from "./section-head";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export type FaqEntry = FaqItem & { id: string };

const answerTags = {
  releases: (chunks: ReactNode) => (
    <a
      href={RELEASES_URL}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-4 transition-colors hover:text-[color:var(--accent)]"
    >
      {chunks}
    </a>
  ),
};

function FaqRow({
  item,
  index,
  isOpen,
  onToggle,
  reduced,
}: {
  item: FaqEntry;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  reduced: boolean;
}): ReactNode {
  const t = useTranslations("landing.faq");
  const panelId = `faq-panel-${index}`;
  const buttonId = `faq-button-${index}`;
  return (
    <div className="border-b border-fd-border">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
          className={`flex w-full items-center justify-between gap-4 py-5 text-left text-[17px] font-semibold transition-colors hover:text-[color:var(--accent)] ${
            isOpen ? "text-[color:var(--accent)]" : "text-fd-foreground"
          }`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {item.question}
          <motion.span
            aria-hidden="true"
            className="relative grid h-4 w-4 shrink-0 place-items-center"
            initial={false}
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
          >
            <span className="h-px w-3.5" style={{ background: "var(--v-glow)" }} />
            <span className="absolute h-3.5 w-px" style={{ background: "var(--v-glow)" }} />
          </motion.span>
        </button>
      </h3>
      <motion.section
        id={panelId}
        aria-labelledby={buttonId}
        className="overflow-hidden"
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE_OUT }}
      >
        <p className="max-w-[68ch] pb-5 text-[15px] leading-relaxed text-fd-muted-foreground">
          {t.rich(`items.${item.id}.answer`, answerTags)}
        </p>
      </motion.section>
    </div>
  );
}

export function Faq({ items }: { items: ReadonlyArray<FaqEntry> }): ReactNode {
  const t = useTranslations("landing.faq");
  const [open, setOpen] = useState(-1);
  const reduced = useReducedMotionPreference();

  return (
    <section className="vk-gutter vk-w-wide vk-rhythm-lg mx-auto" id="faq">
      <Reveal>
        <SectionHead title={t("heading")} />
      </Reveal>
      <Reveal order={1} className="mt-11 max-w-[880px] border-t border-fd-border">
        {items.map((item, i) => (
          <FaqRow
            key={item.id}
            item={item}
            index={i}
            isOpen={open === i}
            onToggle={() => setOpen((current) => (current === i ? -1 : i))}
            reduced={reduced}
          />
        ))}
      </Reveal>
    </section>
  );
}
