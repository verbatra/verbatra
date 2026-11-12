import type { RunStatusLocale } from "./types.js";

/** How many locales of a recorded run failed or stopped partway. */
export interface IncompleteRun {
  /** Locales whose recorded status is `failed`. */
  readonly failed: number;
  /** Locales whose recorded status is `partial`. */
  readonly partial: number;
}

/**
 * Counts the locales of a recorded run that did not finish cleanly, so a low or absent usage
 * figure is not read as a successful run.
 *
 * @param locales - The per-locale outcomes of a {@link RunStatusFile}.
 * @returns The failed and partial counts, or `undefined` when no locale failed or stopped partway.
 */
export function incompleteRun(
  locales: readonly Pick<RunStatusLocale, "status">[],
): IncompleteRun | undefined {
  const failed = locales.filter((locale) => locale.status === "failed").length;
  const partial = locales.filter((locale) => locale.status === "partial").length;
  return failed + partial === 0 ? undefined : { failed, partial };
}
