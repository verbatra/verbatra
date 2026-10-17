import type { PlaygroundOutput } from "../../lib/playground/schema.ts";
import { MODEL, PROVIDER_BATCH_SIZE } from "./limits.ts";
import type { SourceItem } from "./source.ts";

export interface PlannedPair {
  readonly id: string;
  readonly language: string;
  readonly reason: "new" | "changed";
}

export interface PlaygroundPlan {
  readonly pairs: readonly PlannedPair[];
  readonly kept: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

function previousItem(existing: PlaygroundOutput | undefined, id: string) {
  return existing?.items.find((item) => item.id === id);
}

function isUnchanged(item: SourceItem, existing: PlaygroundOutput | undefined): boolean {
  const before = previousItem(existing, item.id);
  return (
    before !== undefined &&
    existing?.metadata.model === MODEL &&
    before.text === item.text &&
    (before.sameAllowed === true) === (item.sameAllowed === true)
  );
}

export function planPairs(
  items: readonly SourceItem[],
  languages: readonly string[],
  existing: PlaygroundOutput | undefined,
): PlaygroundPlan {
  const pairs: PlannedPair[] = [];
  const kept: Record<string, Record<string, string>> = {};
  for (const language of languages) {
    const keptForLanguage: Record<string, string> = {};
    for (const item of items) {
      const value = existing?.translations[language]?.[item.id];
      const unchanged = isUnchanged(item, existing);
      if (value !== undefined && unchanged) {
        keptForLanguage[item.id] = value;
      } else {
        const known = previousItem(existing, item.id) !== undefined;
        pairs.push({ id: item.id, language, reason: known && !unchanged ? "changed" : "new" });
      }
    }
    kept[language] = keptForLanguage;
  }
  return { pairs, kept };
}

export function estimateRequests(plan: PlaygroundPlan): number {
  const perLanguage = new Map<string, number>();
  for (const pair of plan.pairs) {
    perLanguage.set(pair.language, (perLanguage.get(pair.language) ?? 0) + 1);
  }
  let requests = 0;
  for (const count of perLanguage.values()) {
    requests += Math.ceil(count / PROVIDER_BATCH_SIZE);
  }
  return requests;
}
