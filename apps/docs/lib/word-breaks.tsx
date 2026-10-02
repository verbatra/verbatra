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
