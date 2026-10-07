import type { SupportedFormat } from "@verbatra/sdk";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { StackIcon, type StackIconKey, StackIconSprite } from "@/components/stack-icons";
import { type Locale, localizeHref } from "@/lib/i18n";

const ICON_SIZE = 28;

export const FORMAT_ID_CLASS = "whitespace-nowrap @max-[23.5rem]:whitespace-normal";

export type StackCard = {
  label: string;
  href: string;
  icon: StackIconKey;
  formats: ReadonlyArray<SupportedFormat>;
  badge?: string;
  description?: string;
};

export function stackIconPrefix(labelledBy: string): string {
  return `vk-stack-icon-${labelledBy}`;
}

function FormatIds({ formats }: { formats: ReadonlyArray<SupportedFormat> }): ReactNode {
  return (
    <p className="vk-stack-card-formats">
      {formats.map((format, index) => (
        <Fragment key={format}>
          {index > 0 ? ", " : null}
          <span className={FORMAT_ID_CLASS}>{format}</span>
        </Fragment>
      ))}
    </p>
  );
}

function Chevron(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="vk-stack-card-chevron"
      viewBox="0 0 3 6"
      width="5"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M0 0L3 3L0 6" />
    </svg>
  );
}

function Card({
  card,
  prefix,
  locale,
}: {
  card: StackCard;
  prefix: string;
  locale: Locale;
}): ReactNode {
  return (
    <li className="vk-stack-card">
      <div className="vk-stack-card-text">
        <p className="vk-stack-card-name">
          <Link href={localizeHref(locale, card.href) ?? card.href} className="vk-stack-card-link">
            {card.label}
            {card.badge === undefined ? null : (
              <span className="vk-pill vk-stack-card-badge">
                <span className="sr-only">, </span>
                {card.badge}
              </span>
            )}
          </Link>
          <Chevron />
        </p>
        {card.description === undefined ? null : (
          <p className="vk-stack-card-description">{card.description}</p>
        )}
        {card.formats.length > 0 ? <FormatIds formats={card.formats} /> : null}
      </div>
      <span aria-hidden="true" className="vk-stack-card-chip">
        <StackIcon prefix={prefix} icon={card.icon} size={ICON_SIZE} />
      </span>
    </li>
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
      <ul className="vk-stack-grid">
        {cards.map((card) => (
          <Card key={card.href} card={card} prefix={prefix} locale={locale} />
        ))}
      </ul>
    </nav>
  );
}
