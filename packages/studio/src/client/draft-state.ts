export interface DraftState {
  readonly identity: string | null;
  readonly baseline: string;
  readonly text: string;
}

export const EMPTY_DRAFT: DraftState = { identity: null, baseline: "", text: "" };

export function draftIdentity(locale: string | null, key: string, session = 0): string | null {
  return locale === null ? null : JSON.stringify([locale, key, session]);
}

export function isDraftDirty(state: DraftState): boolean {
  return state.text !== state.baseline;
}

export function reconcileDraft(
  state: DraftState,
  identity: string | null,
  baseline: string | null,
): DraftState {
  if (identity === null) {
    return state.identity === null ? state : EMPTY_DRAFT;
  }
  if (baseline === null) {
    return state;
  }
  if (state.identity === identity && state.baseline === baseline) {
    return state;
  }
  const keepsEdits = state.identity === identity && isDraftDirty(state);
  return { identity, baseline, text: keepsEdits ? state.text : baseline };
}
