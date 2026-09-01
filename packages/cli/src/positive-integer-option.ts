import { CliUsageError } from "./cli-usage-error.js";

export interface PositiveIntegerOptionSpec {
  readonly code: string;
  readonly describe: string;
  readonly min: number;
  readonly max?: number;
}

export function parsePositiveIntegerOption(
  value: string | undefined,
  spec: PositiveIntegerOptionSpec,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  const tooLarge = spec.max !== undefined && parsed > spec.max;
  if (!/^\d+$/.test(value) || parsed < spec.min || tooLarge) {
    throw new CliUsageError(spec.code, `The ${spec.describe}, got "${value}".`);
  }
  return parsed;
}
