export class CliUsageError extends Error {
  readonly code: string;
  readonly candidates: readonly string[] | undefined;
  readonly missing: readonly string[] | undefined;

  constructor(
    code: string,
    message: string,
    candidates?: readonly string[],
    missing?: readonly string[],
  ) {
    super(message);
    this.name = "CliUsageError";
    this.code = code;
    this.candidates = candidates;
    this.missing = missing === undefined || missing.length === 0 ? undefined : missing;
  }
}
