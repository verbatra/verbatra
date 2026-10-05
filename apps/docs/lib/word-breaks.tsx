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

const URL_PATTERN = /(https?:\/\/\S*[^\s.,;:!?)])/;

const URL_AUTHORITY = /^https?:\/\/[^/?#]*\/*/;

function urlSegments(url: string): ReadonlyArray<string> {
  const authority = url.match(URL_AUTHORITY)?.[0] ?? "";
  const pieces = url.slice(authority.length).split(/(?<=\/)(?!\/)/);
  const [first = "", ...rest] = authority.endsWith("/") ? ["", ...pieces] : pieces;
  return [authority + first, ...rest].filter((segment) => segment !== "");
}

export function breakUrlsAtSlashes(text: string): ReactNode {
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
      part
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
