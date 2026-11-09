import type {
  ApplyValueReplaceResult,
  ValueReplacePreview,
  ValueReplacePreviewEntry,
} from "@verbatra/sdk";
import { useEffect, useRef, useState } from "react";
import type { StructuredError } from "../client/state.js";
import {
  applyParams,
  NO_OPT_INS,
  notSentEntries,
  previewParams,
  type ReplaceCriteria,
  type ReplaceOptIns,
} from "../client/value-replace.js";
import { rpcClient } from "./api.js";
import { installRouteGuard, restoreHeldRoute, setUnloadWarning } from "./route-guard.js";

export type ReplacePhase =
  | { readonly kind: "criteria"; readonly error: StructuredError | null; readonly busy: boolean }
  | {
      readonly kind: "review";
      readonly criteria: ReplaceCriteria;
      readonly preview: ValueReplacePreview;
      readonly optIns: ReplaceOptIns;
      readonly applying: boolean;
      readonly error: StructuredError | null;
    }
  | {
      readonly kind: "result";
      readonly criteria: ReplaceCriteria;
      readonly result: ApplyValueReplaceResult;
      readonly notSent: readonly ValueReplacePreviewEntry[];
      readonly truncated: boolean;
    };

export interface ValueReplaceFlow {
  readonly phase: ReplacePhase;
  readonly lastCriteria: ReplaceCriteria | null;
  readonly navigationHeld: boolean;
  runPreview(criteria: ReplaceCriteria): void;
  setOptIn(name: keyof ReplaceOptIns, value: boolean): void;
  apply(): void;
  backToCriteria(): void;
}

function useApplyHold(applying: boolean): boolean {
  const [navigationHeld, setNavigationHeld] = useState(false);
  useEffect(() => {
    if (!applying) {
      return;
    }
    setUnloadWarning(true);
    const uninstall = installRouteGuard({
      isDirty: () => true,
      onBlock: () => setNavigationHeld(true),
    });
    return () => {
      restoreHeldRoute();
      uninstall();
      setUnloadWarning(false);
      setNavigationHeld(false);
    };
  }, [applying]);
  return navigationHeld;
}

const IDLE: ReplacePhase = { kind: "criteria", error: null, busy: false };

export function useValueReplace(allLocales: readonly string[]): ValueReplaceFlow {
  const [phase, setPhase] = useState<ReplacePhase>(IDLE);
  const [lastCriteria, setLastCriteria] = useState<ReplaceCriteria | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const navigationHeld = useApplyHold(phase.kind === "review" && phase.applying);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function runPreview(criteria: ReplaceCriteria): void {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setLastCriteria(criteria);
    setPhase({ kind: "criteria", error: null, busy: true });
    void rpcClient
      .call("translation.previewValueReplace", previewParams(criteria, allLocales))
      .then((response) => {
        inFlight.current = false;
        if (!alive.current) {
          return;
        }
        setPhase(
          response.ok
            ? {
                kind: "review",
                criteria,
                preview: response.result,
                optIns: NO_OPT_INS,
                applying: false,
                error: null,
              }
            : { kind: "criteria", error: response.error, busy: false },
        );
      });
  }

  function setOptIn(name: keyof ReplaceOptIns, value: boolean): void {
    setPhase((current) =>
      current.kind === "review" && !current.applying
        ? { ...current, optIns: { ...current.optIns, [name]: value } }
        : current,
    );
  }

  function apply(): void {
    if (phase.kind !== "review" || phase.applying || inFlight.current) {
      return;
    }
    const params = applyParams(phase.criteria, phase.preview, phase.optIns);
    if (params === null) {
      return;
    }
    const review = phase;
    inFlight.current = true;
    setPhase({ ...review, applying: true, error: null });
    void rpcClient.call("translation.applyValueReplace", params).then((response) => {
      inFlight.current = false;
      if (!alive.current) {
        return;
      }
      setPhase(
        response.ok
          ? {
              kind: "result",
              criteria: review.criteria,
              result: response.result,
              notSent: notSentEntries(review.preview, review.optIns),
              truncated: review.preview.truncated,
            }
          : { ...review, applying: false, error: response.error },
      );
    });
  }

  function backToCriteria(): void {
    if (!inFlight.current) {
      setPhase(IDLE);
    }
  }

  return { phase, lastCriteria, navigationHeld, runPreview, setOptIn, apply, backToCriteria };
}
