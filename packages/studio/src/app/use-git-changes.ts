import { useCallback, useEffect, useState } from "react";
import {
  applyGitStatus,
  type GitDiffView,
  type GitStatusView,
  type OpenDiff,
} from "../client/git-changes.js";
import { applyRefreshOutcome } from "../client/state.js";
import { rpcClient } from "./api.js";

export function useGitStatus(refreshToken: number): GitStatusView {
  const [view, setView] = useState<GitStatusView>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpcClient.call("git.status", {}).then((response) => {
      if (cancelled) {
        return;
      }
      setView((previous) => applyGitStatus(previous, response));
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return view;
}

interface HeldDiff {
  readonly locale: string;
  readonly view: GitDiffView;
}

const LOADING_DIFF: GitDiffView = { kind: "loading" };

export function useGitLocaleDiff(
  locale: string | undefined,
  refreshToken: number,
): GitDiffView | undefined {
  const [held, setHeld] = useState<HeldDiff | undefined>(undefined);

  useEffect(() => {
    if (locale === undefined) {
      setHeld(undefined);
      return;
    }
    let cancelled = false;
    void rpcClient.call("git.localeDiff", { locale }).then((response) => {
      if (cancelled) {
        return;
      }
      setHeld((previous) => ({
        locale,
        view: applyRefreshOutcome(
          previous?.locale === locale ? previous.view : LOADING_DIFF,
          response,
        ),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [locale, refreshToken]);

  if (locale === undefined) {
    return undefined;
  }
  return held?.locale === locale ? held.view : LOADING_DIFF;
}

export interface GitChanges {
  readonly status: GitStatusView;
  readonly diff: GitDiffView | undefined;
  readonly open: OpenDiff | undefined;
  readonly toggle: (target: OpenDiff) => void;
}

export function useGitChanges(refreshToken: number): GitChanges {
  const [open, setOpen] = useState<OpenDiff | undefined>(undefined);
  const status = useGitStatus(refreshToken);
  const diff = useGitLocaleDiff(open?.locale, refreshToken);
  const toggle = useCallback((target: OpenDiff) => {
    setOpen((current) => (current?.locale === target.locale ? undefined : target));
  }, []);
  return { status, diff, open, toggle };
}
