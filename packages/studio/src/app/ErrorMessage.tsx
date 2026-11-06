import { Button, Icon } from "@verbatra/ui";
import type { ReactNode } from "react";
import { resolveErrorCopy } from "../client/error-copy.js";
import type { StructuredError } from "../client/state.js";

export interface ErrorMessageProps {
  readonly error: StructuredError;
  readonly prefix?: string;
  readonly detail?: string | undefined;
  readonly onRetry?: () => void;
  readonly retrying?: boolean;
  readonly onCancel?: () => void;
}

function ErrorActions({
  onRetry,
  retrying,
  onCancel,
}: {
  readonly onRetry: (() => void) | undefined;
  readonly onCancel: (() => void) | undefined;
  readonly retrying: boolean;
}): ReactNode {
  if (onRetry === undefined && onCancel === undefined) {
    return null;
  }
  return (
    <span data-error-actions="" className="flex w-full justify-end gap-2">
      {onRetry !== undefined ? (
        <Button
          size="xs"
          data-retry=""
          aria-busy={retrying ? true : undefined}
          aria-disabled={retrying ? true : undefined}
          onClick={retrying ? undefined : onRetry}
        >
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      ) : null}
      {onCancel !== undefined ? (
        <Button size="xs" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </span>
  );
}

export function ErrorMessage({
  error,
  prefix,
  detail,
  onRetry,
  onCancel,
  retrying = false,
}: ErrorMessageProps): ReactNode {
  return (
    <p
      className="mb-4 flex flex-wrap items-start gap-x-2 gap-y-2 rounded-lg border-s-[3px] border-danger bg-danger-soft px-4 py-3 text-danger"
      role="alert"
    >
      <Icon name="alert" className="mt-0.5 flex-none" />
      <span className="min-w-0 flex-1 basis-40 wrap-anywhere">
        {prefix !== undefined ? `${prefix} ` : null}
        {resolveErrorCopy(error)}
        {detail !== undefined ? (
          <>
            {" "}
            <span className="mt-1 block">{detail}</span>
          </>
        ) : null}
      </span>
      <ErrorActions onRetry={onRetry} retrying={retrying} onCancel={onCancel} />
    </p>
  );
}
