import type { LocaleResource } from "@verbatra/core";
import type { FormatAdapter } from "./adapter.js";
import { AdapterError } from "./errors.js";

function carriesOwnCode(error: unknown): boolean {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

function detailOf(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}

function attribute(format: string, method: string, error: unknown): never {
  if (error instanceof AdapterError || carriesOwnCode(error)) {
    throw error;
  }
  throw new AdapterError(
    "ADAPTER_FAILED",
    `The "${format}" adapter failed in ${method}(): ${detailOf(error)}.`,
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
    write: guardAsync(format, "write", (resource: LocaleResource, filePath: string) =>
      adapter.write(resource, filePath),
    ),
    ...(compare === undefined
      ? {}
      : { comparePlaceholders: guard(format, "comparePlaceholders", compare) }),
  };
}
