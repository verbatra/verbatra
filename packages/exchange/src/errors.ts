export type ExchangeErrorCode = "TMX_INVALID" | "WORKBOOK_INVALID";

/** Where in an interchange file a refusal happened. */
export interface ExchangeErrorLocation {
  /** The 1-based line. */
  readonly line: number;
  /** The 1-based column on that line. */
  readonly column: number;
  /** The 1-based ordinal of the translation unit the problem sits in, when it sits in one. */
  readonly unit?: number;
}

function describeLocation(location: ExchangeErrorLocation): string {
  const unit = location.unit === undefined ? "" : `, unit ${location.unit}`;
  return `line ${location.line}, column ${location.column}${unit}`;
}

export class ExchangeError extends Error {
  readonly code: ExchangeErrorCode;
  readonly location: ExchangeErrorLocation | undefined;

  constructor(code: ExchangeErrorCode, message: string, location?: ExchangeErrorLocation) {
    super(location === undefined ? message : `${describeLocation(location)}: ${message}`);
    this.name = "ExchangeError";
    this.code = code;
    this.location = location;
  }
}
