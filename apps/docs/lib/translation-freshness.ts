import type { CommitTimes } from "./commit-times";
import snapshot from "./translation-freshness.generated.json";

export const contentCommitTimes: CommitTimes = snapshot;

export function isTranslationOutdated(
  times: CommitTimes,
  sourcePath: string,
  translationPath: string,
): boolean {
  const source = times[sourcePath];
  const translation = times[translationPath];
  if (source === undefined || translation === undefined) return false;
  return source > translation;
}
