"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const RESET_DELAY_MS = 1500;

export type CopyStatus = "idle" | "copied" | "failed";

export type CopyState = {
  status: CopyStatus;
  attempts: number;
  copy: (text: string) => Promise<boolean>;
  reset: () => void;
};

export type CopyOptions = {
  resetDelayMs?: number;
  holdFailure?: boolean;
};

export function useCopyToClipboard({
  resetDelayMs = RESET_DELAY_MS,
  holdFailure = false,
}: CopyOptions = {}): CopyState {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const [attempts, setAttempts] = useState(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timeout.current);
    };
  }, []);

  const reset = useCallback(() => {
    clearTimeout(timeout.current);
    setStatus("idle");
  }, []);

  const copy = useCallback(
    async (text: string) => {
      let copied = true;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        copied = false;
      }
      if (!mounted.current) return copied;
      clearTimeout(timeout.current);
      setStatus(copied ? "copied" : "failed");
      setAttempts((count) => count + 1);
      if (copied || !holdFailure) {
        timeout.current = setTimeout(() => setStatus("idle"), resetDelayMs);
      }
      return copied;
    },
    [resetDelayMs, holdFailure],
  );

  return { status, attempts, copy, reset };
}
