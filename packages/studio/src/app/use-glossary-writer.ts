import { useLayoutEffect, useRef, useState } from "react";
import { deriveGlossaryWriteOutcome } from "../client/glossary-editing.js";
import type { StructuredError } from "../client/state.js";
import type { GlossaryWriteParams, GlossaryWriteResult } from "../shared/rpc/glossary.js";
import { rpcClient } from "./api.js";

export interface WriteFailure {
  readonly error: StructuredError;
  readonly edit: GlossaryWriteParams;
}

export interface GlossaryWriter {
  readonly anyBusy: boolean;
  busy(key: string): boolean;
  failure(key: string): WriteFailure | undefined;
  write(key: string, edit: GlossaryWriteParams): Promise<boolean>;
  retry(key: string): Promise<boolean>;
  dismiss(key: string): void;
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

  async function perform(key: string, edit: GlossaryWriteParams): Promise<boolean> {
    try {
      const outcome = deriveGlossaryWriteOutcome(await rpcClient.call("glossary.write", edit));
      if (outcome.kind === "error") {
        setFailures((current) => new Map(current).set(key, { error: outcome.error, edit }));
        return false;
      }
      setFailures((current) => withoutKey(current, key));
      onChangeRef.current(outcome.glossary);
      return true;
    } finally {
      setPending((current) => withCount(current, key, -1));
    }
  }

  function enqueue(key: string, edit: GlossaryWriteParams): Promise<boolean> {
    setPending((current) => withCount(current, key, 1));
    const result = queue.current.then(() => perform(key, edit));
    queue.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    anyBusy: pending.size > 0,
    busy: (key) => pending.has(key),
    failure: (key) => failures.get(key),
    write(key, edit) {
      setFailures((current) => withoutKey(current, key));
      return enqueue(key, edit);
    },
    dismiss: (key) => setFailures((current) => withoutKey(current, key)),
    retry(key) {
      const failed = failures.get(key);
      return failed === undefined ? Promise.resolve(false) : enqueue(key, failed.edit);
    },
  };
}
