import type { SupportedFormat } from "@verbatra/sdk";
import Link from "next/link";
import type { ReactNode } from "react";
import { StackIcon, type StackIconKey, StackIconSprite } from "@/components/stack-icons";
import { type Locale, localizeHref } from "@/lib/i18n";

const ICON_PREFIX = "vk-stack-icon";
const ICON_SIZE = 20;

export type StackCard = {
  label: string;
  href: string;
  icon: StackIconKey;
  formats: ReadonlyArray<SupportedFormat>;
};

export function StackCards({
  title,
  cards,
  locale,
}: {
  title: string;
  cards: ReadonlyArray<StackCard>;
  locale: Locale;
}): ReactNode {
  return (
    <nav aria-label={title} className="not-prose @container my-6">
      <StackIconSprite prefix={ICON_PREFIX} icons={cards.map((card) => card.icon)} />
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 @[30rem]:grid-cols-2 @[50rem]:grid-cols-3">
        {cards.map((card) => (
          <li key={card.href} className="m-0 flex p-0">
            <Link
              href={localizeHref(locale, card.href) ?? card.href}
              className="vk-stack-card flex min-h-16 w-full items-center gap-3 rounded-xl border px-3.5 py-3"
            >
              <span aria-hidden="true" className="vk-stack-card-chip">
                <StackIcon prefix={ICON_PREFIX} icon={card.icon} size={ICON_SIZE} />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="vk-stack-card-name">{card.label}</span>
                {card.formats.length > 0 ? (
                  <span className="flex flex-wrap gap-x-2 font-mono text-xs text-[color:var(--text-faint)]">
                    {card.formats.map((format) => (
                      <span key={format} className="whitespace-nowrap">
                        {format}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
