import type { SupportedFormat } from "@verbatra/sdk";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { StackIcon, type StackIconKey, StackIconSprite } from "@/components/stack-icons";
import { type Locale, localizeHref } from "@/lib/i18n";

const ICON_SIZE = 20;

export type StackCard = {
  label: string;
  href: string;
  icon: StackIconKey;
  formats: ReadonlyArray<SupportedFormat>;
};

export function stackIconPrefix(labelledBy: string): string {
  return `vk-stack-icon-${labelledBy}`;
}

function FormatIds({ formats }: { formats: ReadonlyArray<SupportedFormat> }): ReactNode {
  return (
    <span className="font-mono text-xs text-[color:var(--text-faint)]">
      <span className="sr-only">: </span>
      {formats.map((format, index) => (
        <Fragment key={format}>
          {index > 0 ? ", " : null}
          <span className="whitespace-nowrap @max-[21rem]:whitespace-normal">{format}</span>
        </Fragment>
      ))}
    </span>
  );
}

export function StackCards({
  labelledBy,
  cards,
  locale,
}: {
  labelledBy: string;
  cards: ReadonlyArray<StackCard>;
  locale: Locale;
}): ReactNode {
  const prefix = stackIconPrefix(labelledBy);
  return (
    <nav aria-labelledby={labelledBy} className="not-prose @container my-6">
      <StackIconSprite prefix={prefix} icons={cards.map((card) => card.icon)} />
      <ul className="vk-stack-grid m-0 grid list-none gap-3 p-0">
        {cards.map((card) => (
          <li key={card.href} className="m-0 flex p-0">
            <Link
              href={localizeHref(locale, card.href) ?? card.href}
              className="vk-stack-card flex min-h-16 w-full items-center gap-3 rounded-xl border px-3.5 py-3"
            >
              <span aria-hidden="true" className="vk-stack-card-chip">
                <StackIcon prefix={prefix} icon={card.icon} size={ICON_SIZE} />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="vk-stack-card-name">{card.label}</span>
                {card.formats.length > 0 ? <FormatIds formats={card.formats} /> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
