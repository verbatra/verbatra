export const CHECK_CLI_COMMAND = "verbatra check";

export function checkLocaleLine(locale: string, missing: number, upToDate: number): string {
  return `  ${locale}: ${missing} missing, 0 stale, ${upToDate} up-to-date (out of sync)`;
}

export const CHECK_OVERALL_LINE = "out of sync (run verbatra translate to update)";
