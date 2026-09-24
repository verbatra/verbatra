import type { ReactNode } from "react";
import { Fragment } from "react";
import { directionForValue, type TextDirection } from "../client/locale-direction.js";
import { segmentValue } from "../client/value-tokens.js";
import { cn } from "./lib/cn.js";

export type ValueDirection = TextDirection;

export function valueDirection(locale: string | undefined, value?: string): ValueDirection {
  return directionForValue(value, locale);
}

const SCROLLABLE_CLASSES =
  "overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

const HIGHLIGHTED_TOKEN_CLASSES =
  "rounded-sm bg-accent px-0.5 font-mono text-[0.92em] text-accent-foreground";

function renderSegments(value: string, highlightTokens: boolean): ReactNode[] {
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const segment of segmentValue(value)) {
    nodes.push(
      segment.kind === "token" ? (
        <bdi
          key={offset}
          dir="ltr"
          className={cn("whitespace-nowrap", highlightTokens && HIGHLIGHTED_TOKEN_CLASSES)}
          data-value-token=""
        >
          {segment.text}
        </bdi>
      ) : (
        <Fragment key={offset}>{segment.text}</Fragment>
      ),
    );
    offset += segment.text.length;
  }
  return nodes;
}

export function TranslationValue({
  value,
  locale,
  as: Element = "span",
  className,
  title,
  highlightTokens = false,
  ...dataAttributes
}: {
  readonly value: string;
  readonly highlightTokens?: boolean;
  readonly locale?: string | undefined;
  readonly as?: "span" | "p";
  readonly className?: string;
  readonly title?: string;
  readonly [dataAttribute: `data-${string}`]: string;
}): ReactNode {
  return (
    <Element
      className={cn("text-start", Element === "p" && SCROLLABLE_CLASSES, className)}
      dir={valueDirection(locale, value)}
      lang={locale}
      title={title}
      {...dataAttributes}
    >
      {renderSegments(value, highlightTokens)}
    </Element>
  );
}
