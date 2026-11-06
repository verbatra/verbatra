import type { ReactNode } from "react";
import { ErrorMessage } from "./ErrorMessage.js";
import type { DiffState } from "./use-diff-state.js";

export function DiffErrorNotice({
  diff,
  hideCode,
}: {
  readonly diff: DiffState;
  readonly hideCode?: string | undefined;
}): ReactNode {
  if (diff.kind === "error" && diff.error.code !== hideCode) {
    return <ErrorMessage error={diff.error} />;
  }
  if (
    diff.kind === "loaded" &&
    diff.staleError !== undefined &&
    diff.staleError.code !== hideCode
  ) {
    return (
      <ErrorMessage error={diff.staleError} prefix="Showing the last known pending changes." />
    );
  }
  return null;
}
