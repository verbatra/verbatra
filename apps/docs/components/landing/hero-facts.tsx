import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FORMAT_COUNT, PROVIDER_COUNT } from "@/lib/landing-facts";
import { PACKAGE_VERSION } from "@/lib/site";
import { cn } from "@/lib/utils";

type Fact = { key: "release" | "formats" | "providers" | "license"; value: string };

const FACTS: ReadonlyArray<Fact> = [
  { key: "release", value: `@verbatra/cli ${PACKAGE_VERSION}` },
  { key: "formats", value: String(FORMAT_COUNT) },
  { key: "providers", value: String(PROVIDER_COUNT) },
  { key: "license", value: "MIT" },
];

export function HeroFacts({ className }: { className?: string }): ReactNode {
  const t = useTranslations("landing.hero.facts");
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-6 gap-y-[18px] pt-[22px] text-left text-sm md:grid-cols-4",
        className,
      )}
      style={{
        borderTop: "1px solid color-mix(in srgb, var(--border-default) 70%, transparent)",
      }}
    >
      {FACTS.map((fact) => (
        <div key={fact.key}>
          <dt className="text-[color:var(--text-faint)]">{t(fact.key)}</dt>
          <dd className="mt-0.5 font-medium text-fd-foreground tabular-nums">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
