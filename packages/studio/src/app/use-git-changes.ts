import { useCallback, useEffect, useRef, useState } from "react";
import { createCoalescedRunner } from "../client/coalesce.js";
import {
  applyGitDiff,
  applyGitStatus,
  type GitDiffView,
  type GitStatusView,
  type OpenDiff,
} from "../client/git-changes.js";
import { rpcClient } from "./api.js";

export function useGitStatus(refreshToken: number): GitStatusView {
  const [view, setView] = useState<GitStatusView>({ kind: "loading" });
  const alive = useRef(true);
  const runner = useRef<ReturnType<typeof createCoalescedRunner> | undefined>(undefined);

  if (runner.current === undefined) {
    runner.current = createCoalescedRunner(async () => {
      const response = await rpcClient.call("git.status", {});
      if (alive.current) {
        setView((previous) => applyGitStatus(previous, response));
      }
    });
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    runner.current?.trigger();
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
  const alive = useRef(true);
  const wanted = useRef<string | undefined>(locale);
  const runner = useRef<ReturnType<typeof createCoalescedRunner> | undefined>(undefined);

  wanted.current = locale;

  if (runner.current === undefined) {
    runner.current = createCoalescedRunner(async () => {
      const asked = wanted.current;
      if (asked === undefined) {
        return;
      }
      const response = await rpcClient.call("git.localeDiff", { locale: asked });
      if (alive.current && wanted.current === asked) {
        setHeld((previous) => ({
          locale: asked,
          view: applyGitDiff(previous?.locale === asked ? previous.view : LOADING_DIFF, response),
        }));
      }
    });
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (locale === undefined) {
      setHeld(undefined);
      return;
    }
    runner.current?.trigger();
  }, [locale, refreshToken]);

  if (locale === undefined) {
    return undefined;
  }
  return held?.locale === locale ? held.view : LOADING_DIFF;
}

function useReturnToPage(onReturn: () => void): void {
  useEffect(() => {
    function onVisibility(): void {
      if (document.visibilityState === "visible") {
        onReturn();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onReturn);
    };
  }, [onReturn]);
}

export interface GitChanges {
  readonly status: GitStatusView;
  readonly diff: GitDiffView | undefined;
  readonly open: OpenDiff | undefined;
  readonly toggle: (target: OpenDiff) => void;
}

export function useGitChanges(refreshToken: number): GitChanges {
  const [open, setOpen] = useState<OpenDiff | undefined>(undefined);
  const [returns, setReturns] = useState(0);
  const onReturn = useCallback(() => setReturns((count) => count + 1), []);
  useReturnToPage(onReturn);
  const token = refreshToken + returns;
  const status = useGitStatus(token);
  const diff = useGitLocaleDiff(open?.locale, token);
  const toggle = useCallback((target: OpenDiff) => {
    setOpen((current) => (current?.locale === target.locale ? undefined : target));
  }, []);
  return { status, diff, open, toggle };
}
