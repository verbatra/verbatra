import type { ProvenanceSummary } from "@verbatra/sdk";
import { z } from "zod";

export const LOCK_STATE_METHOD = "lock.state";

export const lockStateParamsSchema = z.strictObject({});

export type LockStateParams = z.infer<typeof lockStateParamsSchema>;

export interface LockLocaleState {
  readonly locale: string;
  readonly keyCount: number;
  readonly missing: number;
  readonly stale: number;
  readonly upToDate: number;
  readonly emptySource?: number;
  readonly provenance?: ProvenanceSummary;
}

export type LockStateResult =
  | { readonly exists: false }
  | {
      readonly exists: true;
      readonly version: number;
      readonly locales: readonly LockLocaleState[];
    };
