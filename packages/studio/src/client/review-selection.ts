export type SelectionState = "none" | "some" | "all";

export function toggleSelected(selected: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function withAllSelected(
  selected: ReadonlySet<string>,
  ids: readonly string[],
  on: boolean,
): ReadonlySet<string> {
  const next = new Set(selected);
  for (const id of ids) {
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }
  return next;
}

export function selectedAmong(
  ids: readonly string[],
  selected: ReadonlySet<string>,
): readonly string[] {
  return ids.filter((id) => selected.has(id));
}

export function selectionState(
  ids: readonly string[],
  selected: ReadonlySet<string>,
): SelectionState {
  const count = selectedAmong(ids, selected).length;
  if (count === 0) {
    return "none";
  }
  return count === ids.length ? "all" : "some";
}

export function bulkDecisionBlocker(
  selectedCount: number,
  withValueCount: number,
  maxEntries: number,
): string | null {
  if (selectedCount > maxEntries) {
    return `Select at most ${maxEntries} entries to approve or reject at once.`;
  }
  if (withValueCount < selectedCount) {
    return "Wait for the current translations to load before approving or rejecting.";
  }
  return null;
}

export function bulkRetranslateBlocker(selectedCount: number, maxEntries: number): string | null {
  return selectedCount > maxEntries
    ? `Select at most ${maxEntries} entries to retranslate at once.`
    : null;
}
