import { useLayoutEffect, useRef, useState } from "react";
import { deriveGlossaryWriteOutcome, isRemovalEdit } from "../client/glossary-editing.js";
import type { StructuredError } from "../client/state.js";
import type { GlossaryWriteParams, GlossaryWriteResult } from "../shared/rpc/glossary.js";
import { rpcClient } from "./api.js";

export interface WriteFailure {
  readonly key: string;
  readonly error: StructuredError;
  readonly edit: GlossaryWriteParams;
}

export interface WriteOptions {
  readonly onDone?: () => void;
  readonly stillWanted?: () => boolean;
}

export interface GlossaryWriter {
  readonly anyBusy: boolean;
  busy(key: string): boolean;
  failure(key: string): WriteFailure | undefined;
  firstFailure(): WriteFailure | undefined;
  failureKeys(): readonly string[];
  write(key: string, edit: GlossaryWriteParams, options?: WriteOptions): Promise<boolean>;
  retry(key: string, options?: WriteOptions): Promise<boolean>;
  dismiss(key: string): void;
  dismissDrafts(): void;
}

function withCount(
  counts: ReadonlyMap<string, number>,
  key: string,
  by: number,
): Map<string, number> {
  const next = new Map(counts);
  const count = (next.get(key) ?? 0) + by;
  if (count <= 0) {
    next.delete(key);
  } else {
    next.set(key, count);
  }
  return next;
}

function withoutKey<T>(map: ReadonlyMap<string, T>, key: string): Map<string, T> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

export function useGlossaryWriter(onChange: (next: GlossaryWriteResult) => void): GlossaryWriter {
  const [pending, setPending] = useState<ReadonlyMap<string, number>>(new Map());
  const [failures, setFailures] = useState<ReadonlyMap<string, WriteFailure>>(new Map());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  async function perform(
    key: string,
    edit: GlossaryWriteParams,
    options: WriteOptions | undefined,
  ): Promise<boolean> {
    try {
      if (options?.stillWanted?.() === false) {
        return false;
      }
      const outcome = deriveGlossaryWriteOutcome(await rpcClient.call("glossary.write", edit));
      if (outcome.kind === "error") {
        setFailures((current) => new Map(current).set(key, { key, error: outcome.error, edit }));
        return false;
      }
      setFailures((current) => withoutKey(current, key));
      onChangeRef.current(outcome.glossary);
      options?.onDone?.();
      return true;
    } finally {
      setPending((current) => withCount(current, key, -1));
    }
  }

  function enqueue(
    key: string,
    edit: GlossaryWriteParams,
    options: WriteOptions | undefined,
  ): Promise<boolean> {
    setPending((current) => withCount(current, key, 1));
    const result = queue.current.then(() => perform(key, edit, options));
    queue.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function dismiss(key: string): void {
    setFailures((current) => withoutKey(current, key));
  }

  return {
    anyBusy: pending.size > 0,
    busy: (key) => pending.has(key),
    failure: (key) => failures.get(key),
    firstFailure: () => failures.values().next().value,
    failureKeys: () => [...failures.keys()],
    write(key, edit, options) {
      dismiss(key);
      return enqueue(key, edit, options);
    },
    dismiss,
    dismissDrafts() {
      setFailures(
        (current) => new Map([...current].filter(([, failure]) => isRemovalEdit(failure.edit))),
      );
    },
    retry(key, options) {
      const failed = failures.get(key);
      return failed === undefined ? Promise.resolve(false) : enqueue(key, failed.edit, options);
    },
  };
}
