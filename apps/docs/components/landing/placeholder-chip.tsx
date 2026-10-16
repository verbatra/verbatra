import { Fragment, type ReactNode } from "react";

const PLACEHOLDER_TOKEN = /\{\{\s*[\w.]+\s*\}\}|\{[\w.]+\}/g;

const WHOLE_PLACEHOLDER_TOKEN = new RegExp(`^(?:${PLACEHOLDER_TOKEN.source})$`);

const NO_BROKEN_TOKENS: ReadonlySet<string> = new Set();

const ENDS_IN_SIGN_OR_QUOTE = /[+\-"']$/;

const STARTS_WITH_QUOTE = /^["']/;

export function PlaceholderChip({
  token,
  broken = false,
  keepStart = false,
  keepEnd = false,
}: {
  token: string;
  broken?: boolean;
  keepStart?: boolean;
  keepEnd?: boolean;
}): ReactNode {
  return (
    <span
      className="vk-placeholder"
      data-placeholder=""
      data-broken={broken ? "" : undefined}
      data-keep-start={keepStart ? "" : undefined}
      data-keep-end={keepEnd ? "" : undefined}
    >
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
  const parts = splitPlaceholders(text);
  return parts.map((part, index) => (
    <Fragment key={`${index}:${part}`}>
      {isPlaceholderToken(part) ? (
        <PlaceholderChip
          token={part}
          broken={broken.has(part)}
          keepStart={ENDS_IN_SIGN_OR_QUOTE.test(parts[index - 1] ?? "")}
          keepEnd={STARTS_WITH_QUOTE.test(parts[index + 1] ?? "")}
        />
      ) : (
        part
      )}
    </Fragment>
  ));
}
