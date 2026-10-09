import { Fragment, type ReactNode } from "react";

export function breakAfterUnderscores(text: ReactNode): ReactNode {
  if (typeof text !== "string" || !text.includes("_")) return text;
  return text.split(/(?<=_)/).map((part, index) => (
    <Fragment key={`${index}-${part}`}>
      {index > 0 ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}

export const CODE_BREAK_CLASS = "vk-code-break";

const SOFT_BREAK_AFTER = new Set([".", "/", "]"]);
const SOFT_BREAK_BEFORE = /[\w{[<$@*]/;
const SOFT_BREAK_AFTER_CHAR = /[\w\])}>*]/;

function isSoftBreak(token: string, index: number): boolean {
  return (
    SOFT_BREAK_AFTER.has(token[index] ?? "") &&
    SOFT_BREAK_AFTER_CHAR.test(token[index - 1] ?? "") &&
    SOFT_BREAK_BEFORE.test(token[index + 1] ?? "")
  );
}

function keepHyphensWhole(piece: string, key: string): ReactNode {
  if (!piece.includes("-")) return piece;
  return (
    <span key={key} className="whitespace-nowrap">
      {piece}
    </span>
  );
}

function tokenBreaks(token: string, key: string): ReactNode {
  if (token.startsWith("-")) return keepHyphensWhole(token, key);
  const parts: ReactNode[] = [];
  let start = 0;
  for (let index = 0; index < token.length - 1; index += 1) {
    const hard = token[index] === "_";
    if (!hard && !isSoftBreak(token, index)) continue;
    parts.push(keepHyphensWhole(token.slice(start, index + 1), `${key}-${start}`));
    parts.push(
      hard ? (
        <wbr key={`${key}-${index}`} />
      ) : (
        <span key={`${key}-${index}`} className={CODE_BREAK_CLASS} />
      ),
    );
    start = index + 1;
  }
  parts.push(keepHyphensWhole(token.slice(start), `${key}-${start}`));
  return <Fragment key={key}>{parts}</Fragment>;
}

export function breakInlineCode(text: ReactNode): ReactNode {
  if (typeof text !== "string") return text;
  return text
    .split(/(\s+)/)
    .map((token, index) => (/^\s*$/.test(token) ? token : tokenBreaks(token, `${index}-${token}`)));
}

const URL_PATTERN = /(https?:\/\/\S*[^\s.,;:!?)])/;

const URL_AUTHORITY = /^https?:\/\/[^/?#]*\/*/;

function urlSegments(url: string): ReadonlyArray<string> {
  const authority = url.match(URL_AUTHORITY)?.[0] ?? "";
  const pieces = url.slice(authority.length).split(/(?<=\/)(?!\/)/);
  const [first = "", ...rest] = authority.endsWith("/") ? ["", ...pieces] : pieces;
  return [authority + first, ...rest].filter((segment) => segment !== "");
}

export function keepFlagsWhole(text: string): ReactNode {
  if (!/(?:^|\s)-/.test(text)) return text;
  const tokens = text.split(/(\s+)/);
  return tokens.map((token, index) => {
    const isFlag = token.startsWith("-");
    const isFlagValue = tokens[index - 2]?.startsWith("-") === true;
    return isFlag || isFlagValue ? keepHyphensWhole(token, `${index}-${token}`) : token;
  });
}

const PACKAGE_RUN = /(\bnpx(?:\s+-\S+)*\s+[^\s-]\S*|--[a-z][\w-]*\s+[^\s-]\S*)/;

export function keepPackageRunsWhole(text: string): ReactNode {
  const parts = text.split(PACKAGE_RUN);
  if (parts.length === 1) return keepFlagsWhole(text);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <span key={`run-${index}`} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      <Fragment key={`text-${index}`}>{keepFlagsWhole(part)}</Fragment>
    ),
  );
}

export function breakUrlsAtSlashes(
  text: string,
  plain: (part: string) => ReactNode = (part) => part,
): ReactNode {
  return text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <Fragment key={`${index}-${part}`}>
        {urlSegments(part).map((segment, segmentIndex) => (
          <Fragment key={`${segmentIndex}-${segment}`}>
            {segmentIndex > 0 ? <wbr /> : null}
            <span className="whitespace-nowrap">{segment}</span>
          </Fragment>
        ))}
      </Fragment>
    ) : (
      plain(part)
    ),
  );
}

export function keepCompoundsWhole(text: string): ReactNode {
  if (!/\S-\S/.test(text)) return text;
  return text.split(/(\S+-\S+)/).map((part, index) =>
    index % 2 === 1 ? (
      <span key={`${index}-${part}`} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export const LINK_LABEL_WHOLE_MAX_WORDS = 2;

export function keepLinkLabelWhole(text: string): ReactNode {
  if (text.trim().split(/\s+/).length > LINK_LABEL_WHOLE_MAX_WORDS) return keepCompoundsWhole(text);
  return <span className="whitespace-nowrap">{text}</span>;
}
