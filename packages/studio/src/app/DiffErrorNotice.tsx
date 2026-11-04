import type { ReactNode } from "react";
import { ErrorMessage } from "./ErrorMessage.js";
import type { DiffState } from "./use-diff-state.js";

export function DiffErrorNotice({ diff }: { readonly diff: DiffState }): ReactNode {
  if (diff.kind === "error") {
    return <ErrorMessage error={diff.error} />;
  }
  if (diff.kind === "loaded" && diff.staleError !== undefined) {
    return (
      <ErrorMessage error={diff.staleError} prefix="Showing the last known pending changes." />
    );
  }
  return null;
}
