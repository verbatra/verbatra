import { Icon } from "@verbatra/ui";
import type { ReactNode } from "react";
import { resolveErrorCopy } from "../client/error-copy.js";
import type { StructuredError } from "../client/state.js";

export interface ErrorMessageProps {
  readonly error: StructuredError;
  readonly prefix?: string;
}

export function ErrorMessage({ error, prefix }: ErrorMessageProps): ReactNode {
  return (
    <p
      className="mb-4 flex items-start gap-2 rounded-md border-s-[3px] border-danger bg-danger-soft px-4 py-3 text-danger"
      role="alert"
    >
      <Icon name="alert" className="mt-0.5 flex-none" />
      <span>
        {prefix !== undefined ? `${prefix} ` : null}
        {resolveErrorCopy(error)}
      </span>
    </p>
  );
}
