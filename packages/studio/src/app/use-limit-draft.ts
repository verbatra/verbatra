import { useRef, useState } from "react";
import type { KeyValueContext } from "../client/key-value-context.js";
import {
  type LimitControlView,
  limitControlView,
  parseLimitInput,
} from "../client/length-limit.js";
import type { StructuredError } from "../client/state.js";
import { rpcClient } from "./api.js";

export type LoadedContext = Extract<KeyValueContext, { kind: "loaded" }>;

interface Awaiting {
  readonly context: LoadedContext;
  readonly value: number | null;
}

interface Failure {
  readonly error: StructuredError;
  readonly mode: LimitControlView["mode"];
}

interface Held {
  readonly identity: string | null;
  readonly open: boolean;
  readonly text: string;
  readonly initial: string;
  readonly attempted: boolean;
  readonly saving: boolean;
  readonly failure: Failure | null;
  readonly awaiting: Awaiting | null;
}

const NONE: LimitControlView = { mode: "none", value: undefined, notice: undefined };

function fresh(identity: string | null): Held {
  return {
    identity,
    open: false,
    text: "",
    initial: "",
    attempted: false,
    saving: false,
    failure: null,
    awaiting: null,
  };
}

export interface LimitDraft {
  readonly view: LimitControlView;
  readonly effectiveMaxLength: number | undefined;
  readonly open: boolean;
  readonly text: string;
  readonly problem: string;
  readonly saving: boolean;
  readonly dirty: boolean;
  readonly failure: StructuredError | null;
  readonly invalid: StructuredError | null;
  readonly awaitingRead: boolean;
  begin(): void;
  setText(next: string): void;
  cancel(): void;
  remove(): Promise<boolean>;
  save(): Promise<boolean>;
}

function awaitedView(base: LimitControlView, held: Held, context: LoadedContext): LimitControlView {
  const awaiting = held.awaiting;
  if (awaiting === null || awaiting.context !== context) {
    return base;
  }
  return awaiting.value === null
    ? { mode: "none", value: undefined, notice: undefined }
    : { mode: "file", value: awaiting.value, notice: undefined };
}

function effectiveMaxLength(context: LoadedContext | null, held: Held): number | undefined {
  if (context === null) {
    return undefined;
  }
  const awaiting = held.awaiting;
  return awaiting !== null && awaiting.context === context
    ? (awaiting.value ?? undefined)
    : context.maxLength;
}

function invalidFailure(problem: string): StructuredError | null {
  return problem === "" ? null : { code: "LIMIT_NOT_VALID", message: problem };
}

function problemOf(text: string, attempted: boolean): string {
  const parsed = parseLimitInput(text);
  return parsed.kind === "error" && (attempted || text.trim() !== "") ? parsed.message : "";
}

export function useLimitDraft({
  identity,
  keyName,
  context,
  reload,
}: {
  readonly identity: string | null;
  readonly keyName: string;
  readonly context: LoadedContext | null;
  readonly reload: () => void;
}): LimitDraft {
  const [stored, setStored] = useState<Held>(fresh(identity));
  const held = stored.identity === identity ? stored : fresh(identity);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const savingRef = useRef(false);
  const base = context === null ? NONE : limitControlView(context);
  const view = context === null ? NONE : awaitedView(base, held, context);

  function patch(change: Partial<Held>): void {
    setStored({ ...held, ...change, identity });
  }

  function begin(): void {
    const initial = view.value === undefined ? "" : String(view.value);
    patch({ open: true, text: initial, initial, attempted: false, failure: null });
  }

  async function write(maxLength: number | null): Promise<boolean> {
    if (savingRef.current || context === null) {
      return false;
    }
    savingRef.current = true;
    patch({ saving: true, failure: null });
    const response = await rpcClient.call("key.setMaxLength", { key: keyName, maxLength });
    savingRef.current = false;
    if (identityRef.current !== identity) {
      return false;
    }
    if (!response.ok) {
      setStored({
        ...held,
        identity,
        saving: false,
        failure: { error: response.error, mode: view.mode },
      });
      return false;
    }
    setStored({
      ...fresh(identity),
      awaiting: { context, value: response.result.maxLength },
    });
    reload();
    return true;
  }

  async function save(): Promise<boolean> {
    const parsed = parseLimitInput(held.text);
    if (parsed.kind === "error") {
      patch({ attempted: true });
      return false;
    }
    return write(parsed.value);
  }

  const failure =
    held.failure !== null && held.failure.mode === view.mode ? held.failure.error : null;
  return {
    view,
    effectiveMaxLength: effectiveMaxLength(context, held),
    open: held.open,
    text: held.text,
    problem: problemOf(held.text, held.attempted),
    saving: held.saving,
    dirty: held.open && held.text.trim() !== held.initial,
    failure,
    invalid: invalidFailure(problemOf(held.text, held.attempted)),
    awaitingRead: held.awaiting !== null && context !== null && held.awaiting.context === context,
    begin,
    setText: (next) => patch({ text: next, failure: null }),
    cancel: () => patch({ open: false, attempted: false, failure: null }),
    remove: () => write(null),
    save,
  };
}
