export class CliUsageError extends Error {
  readonly code: string;
  readonly candidates: readonly string[] | undefined;

  constructor(code: string, message: string, candidates?: readonly string[]) {
    super(message);
    this.name = "CliUsageError";
    this.code = code;
    this.candidates = candidates;
  }
}
