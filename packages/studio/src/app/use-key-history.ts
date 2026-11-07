import { useCallback, useEffect, useRef, useState } from "react";
import { transientKeyHistoryError } from "../client/key-history.js";
import { orNetworkFailure, type RpcCallResult } from "../client/rpc-client.js";
import { applyRefreshOutcome, type FetchOutcome, type RefreshableView } from "../client/state.js";
import type { KeyRevisionsResult } from "../shared/rpc/key-revisions.js";
import { refreshBus, rpcClient } from "./api.js";
import { useReturnToPage } from "./use-git-changes.js";

export type KeyHistoryView = RefreshableView<KeyRevisionsResult>;

export interface KeyHistoryRead {
  readonly view: KeyHistoryView;
  readonly retrying: boolean;
  readonly retry: () => void;
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
  const transient = transientKeyHistoryError(response.result);
  return transient === undefined ? response : { ok: false, error: transient };
}

export function useKeyHistory(input: {
  readonly enabled: boolean;
  readonly locale: string | undefined;
  readonly keyName: string;
  readonly refreshToken: number;
}): KeyHistoryRead {
  const { enabled, locale, keyName, refreshToken } = input;
  const [held, setHeld] = useState<HeldView | undefined>(undefined);
  const [gitMoves, setGitMoves] = useState(0);
  const [returns, setReturns] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const latest = useRef(0);

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

  useEffect(() => {
    if (!enabled || locale === undefined) {
      latest.current += 1;
      return;
    }
    latest.current += 1;
    const mine = latest.current;
    void orNetworkFailure(rpcClient.call("history.keyRevisions", { locale, key: keyName })).then(
      (response) => {
        if (latest.current !== mine) {
          return;
        }
        setRetrying(false);
        setHeld((previous) => {
          const same = previous?.locale === locale && previous.key === keyName;
          return {
            locale,
            key: keyName,
            view: applyRefreshOutcome(same ? previous.view : LOADING, outcomeOf(response)),
          };
        });
      },
    );
    return () => {
      latest.current += 1;
    };
  }, [enabled, locale, keyName, refreshToken, gitMoves, returns, attempt]);

  const retry = useCallback(() => {
    setRetrying(true);
    setAttempt((count) => count + 1);
  }, []);

  const view =
    held !== undefined && held.locale === locale && held.key === keyName ? held.view : LOADING;
  return { view, retrying, retry };
}
