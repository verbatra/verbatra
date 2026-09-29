import { ExchangeError, type ExchangeErrorCode } from "./errors.js";

const FORBIDDEN_FILE_NAME_CHARS = /[\\/:*?"<>|\p{Cc}]/u;

function assertPlainFileLocale(locale: string, code: ExchangeErrorCode): void {
  if (locale.length === 0 || locale === "." || locale === "..") {
    throw new ExchangeError(
      code,
      `The locale "${locale}" cannot be an interchange file name: it must name a file, not a directory.`,
    );
  }
  if (FORBIDDEN_FILE_NAME_CHARS.test(locale)) {
    throw new ExchangeError(
      code,
      `The locale "${locale}" cannot be an interchange file name: it must not contain a path separator, a control character, or any of : * ? " < > | .`,
    );
  }
}

export function handoffFileName(
  locale: string,
  extension: string,
  code: ExchangeErrorCode,
): string {
  assertPlainFileLocale(locale, code);
  return `${locale}.${extension}`;
}
