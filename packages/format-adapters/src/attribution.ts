import type { LocaleResource } from "@verbatra/core";
import type { FormatAdapter, WriteContext } from "./adapter.js";
import { AdapterError } from "./errors.js";
import { ForeignThrowError } from "./shell.js";

const ERRNO_CODE = /^E[A-Z0-9]+$/;

function carriesErrnoCode(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    ERRNO_CODE.test(error.code)
  );
}

function attribute(format: string, method: string, error: unknown): never {
  const original = error instanceof ForeignThrowError ? error.cause : error;
  if (original instanceof AdapterError || carriesErrnoCode(original)) {
    throw original;
  }
  throw new AdapterError(
    "ADAPTER_FAILED",
    `The "${format}" adapter failed in ${method}(). The adapter's own error is attached as the cause.`,
    { cause: original },
  );
}

function guard<TArgs extends unknown[], TResult>(
  format: string,
  method: string,
  call: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  return (...args: TArgs): TResult => {
    try {
      return call(...args);
    } catch (error) {
      attribute(format, method, error);
    }
  };
}

function guardAsync<TArgs extends unknown[], TResult>(
  format: string,
  method: string,
  call: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await call(...args);
    } catch (error) {
      attribute(format, method, error);
    }
  };
}

export function attributeAdapterFailures(adapter: FormatAdapter): FormatAdapter {
  const { format } = adapter;
  const compare = adapter.comparePlaceholders?.bind(adapter);
  const compareArms = adapter.compareBranchArms?.bind(adapter);
  return {
    format,
    canHandle: guard(format, "canHandle", (filePath: string, sample?: string) =>
      adapter.canHandle(filePath, sample),
    ),
    extractPlaceholders: guard(format, "extractPlaceholders", (value: string) =>
      adapter.extractPlaceholders(value),
    ),
    validateMessage: guard(format, "validateMessage", (value: string) =>
      adapter.validateMessage(value),
    ),
    read: guardAsync(format, "read", (filePath: string, locale: string) =>
      adapter.read(filePath, locale),
    ),
    write: guardAsync(
      format,
      "write",
      (resource: LocaleResource, filePath: string, context?: WriteContext) =>
        adapter.write(resource, filePath, context),
    ),
    ...(compare === undefined
      ? {}
      : { comparePlaceholders: guard(format, "comparePlaceholders", compare) }),
    ...(compareArms === undefined
      ? {}
      : { compareBranchArms: guard(format, "compareBranchArms", compareArms) }),
  };
}
