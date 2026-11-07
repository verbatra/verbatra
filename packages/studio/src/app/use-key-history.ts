import { useCallback, useEffect, useRef, useState } from "react";
import { createPacedRunner, type PacedRunner } from "../client/coalesce.js";
import { transientGitError } from "../client/git-changes.js";
import { orNetworkFailure, type RpcCallResult } from "../client/rpc-client.js";
import { applyRefreshOutcome, type FetchOutcome, type RefreshableView } from "../client/state.js";
import type { KeyRevisionsResult } from "../shared/rpc/key-revisions.js";
import { refreshBus, rpcClient } from "./api.js";
import { useReturnToPage } from "./use-git-changes.js";

export type KeyHistoryView = RefreshableView<KeyRevisionsResult>;

export interface KeyHistoryRead {
  readonly view: KeyHistoryView;
  readonly retrying: boolean;
  readonly pending: boolean;
  readonly retry: () => void;
}

export const KEY_HISTORY_MIN_GAP_MS = 1500;

interface Asked {
  readonly enabled: boolean;
  readonly locale: string | undefined;
  readonly keyName: string;
  readonly limit: number | undefined;
}

interface HeldView {
  readonly locale: string;
  readonly key: string;
  readonly view: KeyHistoryView;
}

const LOADING: KeyHistoryView = { kind: "loading" };

function outcomeOf(
  response: RpcCallResult<"history.keyRevisions">,
): FetchOutcome<KeyRevisionsResult> {
  if (!response.ok) {
    return response;
  }
  const transient = transientGitError(response.result);
  return transient === undefined ? response : { ok: false, error: transient };
}

function settled(
  previous: HeldView | undefined,
  locale: string,
  key: string,
  response: RpcCallResult<"history.keyRevisions">,
): HeldView {
  const same = previous?.locale === locale && previous.key === key;
  return {
    locale,
    key,
    view: applyRefreshOutcome(same ? previous.view : LOADING, outcomeOf(response)),
  };
}

function readKeyHistory(
  asked: Asked,
  locale: string,
): Promise<RpcCallResult<"history.keyRevisions">> {
  return orNetworkFailure(
    rpcClient.call("history.keyRevisions", {
      locale,
      key: asked.keyName,
      ...(asked.limit !== undefined ? { limit: asked.limit } : {}),
    }),
  );
}

function retryAfterSeconds(response: RpcCallResult<"history.keyRevisions">): number | undefined {
  return response.ok ? undefined : response.error.retryAfterSeconds;
}

function sameAsked(left: Asked, right: Asked): boolean {
  return (
    left.enabled === right.enabled &&
    left.locale === right.locale &&
    left.keyName === right.keyName &&
    left.limit === right.limit
  );
}

function useBackgroundTriggers(): number {
  const [gitMoves, setGitMoves] = useState(0);
  const [returns, setReturns] = useState(0);
  useReturnToPage(useCallback(() => setReturns((count) => count + 1), []));
  useEffect(
    () =>
      refreshBus.subscribe((event) => {
        if (event.reason === "git") {
          setGitMoves((count) => count + 1);
        }
      }),
    [],
  );
  return gitMoves + returns;
}

export function useKeyHistory(input: {
  readonly enabled: boolean;
  readonly locale: string | undefined;
  readonly keyName: string;
  readonly refreshToken: number;
  readonly limit?: number | undefined;
}): KeyHistoryRead {
  const { enabled, locale, keyName, refreshToken, limit } = input;
  const [held, setHeld] = useState<HeldView | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [pending, setPending] = useState(false);
  const runner = useRef<PacedRunner | undefined>(undefined);
  const wanted = useRef<Asked>({ enabled, locale, keyName, limit });
  const rateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  wanted.current = { enabled, locale, keyName, limit };
  const background = useBackgroundTriggers() + refreshToken;

  useEffect(() => {
    const paced = createPacedRunner(
      async () => {
        const asked = wanted.current;
        if (!asked.enabled || asked.locale === undefined) {
          return;
        }
        const { locale: askedLocale } = asked;
        setPending(true);
        const response = await readKeyHistory(asked, askedLocale);
        if (!sameAsked(wanted.current, asked)) {
          return;
        }
        setPending(false);
        setRetrying(false);
        setHeld((previous) => settled(previous, askedLocale, asked.keyName, response));
        const waitSeconds = retryAfterSeconds(response);
        if (waitSeconds !== undefined) {
          clearTimeout(rateTimer.current);
          rateTimer.current = setTimeout(
            () => paced.trigger({ immediate: true }),
            waitSeconds * 1000 + 100,
          );
        }
      },
      { minGapMs: KEY_HISTORY_MIN_GAP_MS },
    );
    runner.current = paced;
    return () => {
      paced.cancel();
      clearTimeout(rateTimer.current);
    };
  }, []);

  useEffect(() => {
    if (enabled && locale !== undefined) {
      runner.current?.trigger({ immediate: true });
    } else {
      setPending(false);
    }
  }, [enabled, locale, keyName, limit, attempt]);

  const seen = useRef(background);
  useEffect(() => {
    if (seen.current !== background) {
      seen.current = background;
      if (enabled && locale !== undefined) {
        runner.current?.trigger();
      }
    }
  }, [background, enabled, locale]);

  const retry = useCallback(() => {
    setRetrying(true);
    setAttempt((count) => count + 1);
  }, []);

  const view =
    held !== undefined && held.locale === locale && held.key === keyName ? held.view : LOADING;
  return { view, retrying, pending, retry };
}
