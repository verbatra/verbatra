import { useCallback, useEffect, useRef, useState } from "react";
import type { FetchOutcome, StructuredError } from "../client/state.js";

export type ReadState<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: StructuredError; readonly retrying: boolean }
  | {
      readonly status: "loaded";
      readonly value: T;
      readonly stale: StructuredError | undefined;
      readonly retrying: boolean;
    };

export interface ReadModel<T> {
  readonly state: ReadState<T>;
  readonly recovered: number;
  retry(): void;
  replace(value: T): void;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useReadModel<T>(
  load: () => Promise<FetchOutcome<T>>,
  refreshToken: number,
): ReadModel<T> {
  const loadRef = useRef(load);
  const [state, setState] = useState<ReadState<T>>({ status: "loading" });
  const [recovered, setRecovered] = useState(0);
  const latestRead = useRef(0);
  const writes = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const read = useCallback(async (byUser: boolean): Promise<void> => {
    latestRead.current += 1;
    const mine = latestRead.current;
    const writesAtStart = writes.current;
    const outcome = await loadRef.current();
    if (!mounted.current || mine !== latestRead.current || writesAtStart !== writes.current) {
      return;
    }
    if (outcome.ok) {
      setState((current) => {
        if (current.status !== "loaded" || !sameValue(current.value, outcome.result)) {
          return { status: "loaded", value: outcome.result, stale: undefined, retrying: false };
        }
        return current.stale === undefined && !current.retrying
          ? current
          : { ...current, stale: undefined, retrying: false };
      });
      if (byUser) {
        setRecovered((count) => count + 1);
      }
      return;
    }
    setState((current) =>
      current.status === "loaded"
        ? { ...current, stale: outcome.error, retrying: false }
        : { status: "error", error: outcome.error, retrying: false },
    );
  }, []);

  useEffect(() => {
    void read(false);
  }, [refreshToken, read]);

  const retry = useCallback((): void => {
    setState((current) =>
      current.status === "loading" ? current : { ...current, retrying: true },
    );
    void read(true);
  }, [read]);

  const replace = useCallback((value: T): void => {
    writes.current += 1;
    setState({ status: "loaded", value, stale: undefined, retrying: false });
  }, []);

  return { state, recovered, retry, replace };
}
