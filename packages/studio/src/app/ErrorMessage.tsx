import { Button, Icon } from "@verbatra/ui";
import type { ReactNode } from "react";
import { resolveErrorCopy } from "../client/error-copy.js";
import type { StructuredError } from "../client/state.js";

export interface ErrorMessageProps {
  readonly error: StructuredError;
  readonly prefix?: string;
  readonly onRetry?: () => void;
  readonly onCancel?: () => void;
}

export function ErrorMessage({ error, prefix, onRetry, onCancel }: ErrorMessageProps): ReactNode {
  return (
    <p
      className="mb-4 flex flex-wrap items-start gap-x-2 gap-y-2 rounded-lg border-s-[3px] border-danger bg-danger-soft px-4 py-3 text-danger"
      role="alert"
    >
      <Icon name="alert" className="mt-0.5 flex-none" />
      <span className="min-w-0 flex-1 basis-40">
        {prefix !== undefined ? `${prefix} ` : null}
        {resolveErrorCopy(error)}
      </span>
      {onRetry !== undefined || onCancel !== undefined ? (
        <span data-error-actions="" className="flex w-full justify-end gap-2">
          {onRetry !== undefined ? (
            <Button size="xs" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
          {onCancel !== undefined ? (
            <Button size="xs" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </span>
      ) : null}
    </p>
  );
}
