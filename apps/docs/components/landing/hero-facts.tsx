import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { HERO_FACTS, type LandingFact } from "@/lib/landing-facts";
import { cn } from "@/lib/utils";

function FactValue({ fact }: { fact: LandingFact }): ReactNode {
  if (!fact.href) return fact.value;
  return (
    <a
      href={fact.href}
      target="_blank"
      rel="noreferrer noopener"
      className="vk-prose-link"
      data-umami-event="outbound-link"
      data-umami-event-target={fact.key}
    >
      {fact.value}
    </a>
  );
}

export function HeroFacts({ className }: { className?: string }): ReactNode {
  const t = useTranslations("landing.hero.facts");
  return (
    <dl className={cn("vk-hero-facts-table", className)}>
      {HERO_FACTS.map((fact) => (
        <div key={fact.key} className="contents">
          <dt>{t(fact.key)}</dt>
          <dd>
            <FactValue fact={fact} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
