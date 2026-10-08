import { type CSSProperties, Fragment, type ReactNode } from "react";

const PLACEHOLDER = /\{[^}]*\}/;

export function keepsWhole(token: string): boolean {
  return PLACEHOLDER.test(token);
}

export function wrapLineStyle(text: string): CSSProperties {
  return { "--wrap-lead": `${text.length - text.trimStart().length}ch` } as CSSProperties;
}

export function WrapTokens({
  text,
  render = (token) => token,
}: {
  text: string;
  render?: (token: string) => ReactNode;
}): ReactNode {
  return text.split(" ").map((token, index) => (
    <Fragment key={`${index}:${token}`}>
      {index > 0 ? " " : null}
      {keepsWhole(token) ? (
        <span className="whitespace-nowrap">{render(token)}</span>
      ) : (
        render(token)
      )}
    </Fragment>
  ));
}
