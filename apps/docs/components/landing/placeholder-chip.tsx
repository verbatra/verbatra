import { Fragment, type ReactNode } from "react";

const PLACEHOLDER_TOKEN = /\{\{\s*[\w.]+\s*\}\}|\{[\w.]+\}/g;

const WHOLE_PLACEHOLDER_TOKEN = new RegExp(`^(?:${PLACEHOLDER_TOKEN.source})$`);

const NO_BROKEN_TOKENS: ReadonlySet<string> = new Set();

export function PlaceholderChip({
  token,
  broken = false,
}: {
  token: string;
  broken?: boolean;
}): ReactNode {
  return (
    <span className="vk-placeholder" data-placeholder="" data-broken={broken ? "" : undefined}>
      {token}
    </span>
  );
}

export function splitPlaceholders(text: string): ReadonlyArray<string> {
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER_TOKEN)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(match[0]);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function isPlaceholderToken(part: string): boolean {
  return WHOLE_PLACEHOLDER_TOKEN.test(part);
}

export function PlaceholderText({
  text,
  broken = NO_BROKEN_TOKENS,
}: {
  text: string;
  broken?: ReadonlySet<string>;
}): ReactNode {
  return splitPlaceholders(text).map((part, index) => (
    <Fragment key={`${index}:${part}`}>
      {isPlaceholderToken(part) ? <PlaceholderChip token={part} broken={broken.has(part)} /> : part}
    </Fragment>
  ));
}
