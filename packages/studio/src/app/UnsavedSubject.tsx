import type { ReactNode } from "react";

export function UnsavedSubject({
  locale,
  value,
  limit,
  restoring = false,
}: {
  readonly locale: string;
  readonly value: boolean;
  readonly limit: boolean;
  readonly restoring?: boolean;
}): ReactNode {
  const name = <span className="font-mono">{locale}</span>;
  return (
    <>
      {value && limit ? (
        <>The {name} translation and the limit you are typing have changes that are not saved.</>
      ) : limit ? (
        <>The limit you are typing for this key is not saved.</>
      ) : (
        <>The {name} translation has changes that are not saved.</>
      )}
      {restoring ? " Restoring replaces them." : ""}
    </>
  );
}
