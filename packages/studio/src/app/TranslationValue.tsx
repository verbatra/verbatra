import type { ReactNode } from "react";
import { Fragment } from "react";
import { isRtlLocale } from "../client/locale-direction.js";
import { segmentValue } from "../client/value-tokens.js";
import { cn } from "./lib/cn.js";

export type ValueDirection = "ltr" | "rtl" | "auto";

export function valueDirection(locale: string | undefined): ValueDirection {
  if (locale === undefined) {
    return "auto";
  }
  return isRtlLocale(locale) ? "rtl" : "ltr";
}

const SCROLLABLE_CLASSES =
  "overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

function renderSegments(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const segment of segmentValue(value)) {
    nodes.push(
      segment.kind === "token" ? (
        <bdi key={offset} dir="ltr" className="whitespace-nowrap" data-value-token="">
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
  ...dataAttributes
}: {
  readonly value: string;
  readonly locale?: string | undefined;
  readonly as?: "span" | "p";
  readonly className?: string;
  readonly title?: string;
  readonly [dataAttribute: `data-${string}`]: string;
}): ReactNode {
  return (
    <Element
      className={cn("text-start", Element === "p" && SCROLLABLE_CLASSES, className)}
      dir={valueDirection(locale)}
      title={title}
      {...dataAttributes}
    >
      {renderSegments(value)}
    </Element>
  );
}
