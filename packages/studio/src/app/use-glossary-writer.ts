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
  firstFailure(): WriteFailure | undefined;
  write(key: string, edit: GlossaryWriteParams, onDone?: () => void): Promise<boolean>;
  retry(key: string, onDone?: () => void): Promise<boolean>;
  dismiss(key: string): void;
  dismissAll(): void;
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
  const epochs = useRef({ all: 0, keys: new Map<string, number>() });
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  function epochOf(key: string): string {
    return `${epochs.current.all}:${epochs.current.keys.get(key) ?? 0}`;
  }

  async function perform(
    key: string,
    edit: GlossaryWriteParams,
    epoch: string,
    onDone: (() => void) | undefined,
  ): Promise<boolean> {
    try {
      const outcome = deriveGlossaryWriteOutcome(await rpcClient.call("glossary.write", edit));
      if (outcome.kind === "error") {
        if (epoch === epochOf(key)) {
          setFailures((current) => new Map(current).set(key, { error: outcome.error, edit }));
        }
        return false;
      }
      setFailures((current) => withoutKey(current, key));
      onChangeRef.current(outcome.glossary);
      onDone?.();
      return true;
    } finally {
      setPending((current) => withCount(current, key, -1));
    }
  }

  function enqueue(
    key: string,
    edit: GlossaryWriteParams,
    onDone: (() => void) | undefined,
  ): Promise<boolean> {
    setPending((current) => withCount(current, key, 1));
    const epoch = epochOf(key);
    const result = queue.current.then(() => perform(key, edit, epoch, onDone));
    queue.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function dismiss(key: string): void {
    epochs.current.keys.set(key, (epochs.current.keys.get(key) ?? 0) + 1);
    setFailures((current) => withoutKey(current, key));
  }

  return {
    anyBusy: pending.size > 0,
    busy: (key) => pending.has(key),
    failure: (key) => failures.get(key),
    firstFailure: () => failures.values().next().value,
    write(key, edit, onDone) {
      dismiss(key);
      return enqueue(key, edit, onDone);
    },
    dismiss,
    dismissAll() {
      epochs.current.all += 1;
      setFailures(new Map());
    },
    retry(key, onDone) {
      const failed = failures.get(key);
      return failed === undefined ? Promise.resolve(false) : enqueue(key, failed.edit, onDone);
    },
  };
}
