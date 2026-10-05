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

export function breakUrlsAtSlashes(text: string): ReactNode {
  return text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <Fragment key={`${index}-${part}`}>
        {part.split(/(?<=\/)(?!\/)/).map((segment, segmentIndex) => (
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
